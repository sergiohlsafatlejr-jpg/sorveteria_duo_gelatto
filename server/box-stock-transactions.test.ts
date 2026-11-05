import { beforeEach, describe, expect, it, vi } from "vitest";
import { boxStock, boxStockMovements } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
const mocks=vi.hoisted(()=>({getDb:vi.fn()}));
vi.mock("./db",()=>({getDb:mocks.getDb}));
vi.mock("./routers/inove",()=>({createInovePool:vi.fn()}));
import { boxStockRouter } from "./routers/boxStock";
function setup(){
 const state:any={box:{id:1,currentStock:3,active:true},movements:[],fail:false,locks:0};
 const tx:any={select:()=>({from:()=>{const q:any={where:()=>q,limit:()=>q,for:()=>{state.locks++;return q;},then:(resolve:any,reject:any)=>Promise.resolve([state.box]).then(resolve,reject)};return q;}}),insert:(table:any)=>({values:async(value:any)=>{if(table===boxStockMovements)state.movements.push(value);}}),update:(table:any)=>({set:(value:any)=>({where:async()=>{if(state.fail)throw new Error('Falha simulada');if(table===boxStock)Object.assign(state.box,value);}})})};
 let queue=Promise.resolve();const db:any={transaction:vi.fn((work:any)=>{const run=queue.then(async()=>{const snapshot=structuredClone(state);try{return await work(tx);}catch(e){Object.assign(state,snapshot);throw e;}});queue=run.then(()=>undefined,()=>undefined);return run;})};mocks.getDb.mockResolvedValue(db);
 const ctx={user:{id:42,role:'admin',active:true},req:{},res:{}} as unknown as TrpcContext;
 return {state,db,caller:boxStockRouter.createCaller(ctx)};
}
beforeEach(()=>vi.resetAllMocks());
describe('movimentos manuais de caixas — serialização com o estoque novo',()=>{
 it('registra entrada e saldo na mesma transação com bloqueio',async()=>{const {state,db,caller}=setup();expect(await caller.addEntry({boxId:1,quantity:2})).toMatchObject({newStock:5});expect(state.movements[0]).toMatchObject({previousStock:3,newStock:5,quantity:2});expect(db.transaction).toHaveBeenCalledOnce();expect(state.locks).toBe(1);});
 it('não registra saída superior ao saldo',async()=>{const {state,caller}=setup();await expect(caller.addExit({boxId:1,quantity:4})).rejects.toThrow('Saldo insuficiente');expect(state.movements).toHaveLength(0);expect(state.box.currentStock).toBe(3);});
 it('reverte movimento se atualizar saldo falhar',async()=>{const {state,caller}=setup();state.fail=true;await expect(caller.addEntry({boxId:1,quantity:2})).rejects.toThrow('Falha simulada');expect(state.movements).toHaveLength(0);expect(state.box.currentStock).toBe(3);});
 it('preserva duas entradas concorrentes sem perder saldo',async()=>{const {state,caller}=setup();await Promise.all([caller.addEntry({boxId:1,quantity:1}),caller.addEntry({boxId:1,quantity:2})]);expect(state.box.currentStock).toBe(6);expect(state.movements).toHaveLength(2);});
 it('ajusta saldo físico e movimento juntos',async()=>{const {state,caller}=setup();expect(await caller.adjustStock({boxId:1,realStock:2})).toMatchObject({diff:-1});expect(state.movements[0]).toMatchObject({type:'saida',quantity:1,previousStock:3,newStock:2});expect(state.box.currentStock).toBe(2);});
});
