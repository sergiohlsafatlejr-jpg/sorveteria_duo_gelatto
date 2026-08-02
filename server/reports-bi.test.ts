import { describe, expect, it } from "vitest";
import {
  classifyChannel,
  classifyAbcProduct,
  calculatePurchaseSuggestion,
} from "./db.reports";

describe("classifyChannel", () => {
  it("deve classificar formas de pagamento iFood como delivery", () => {
    expect(classifyChannel("iFood Pix")).toBe("delivery");
    expect(classifyChannel("iFood Crédito")).toBe("delivery");
  });

  it("deve classificar formas contendo whatsapp ou delivery como delivery", () => {
    expect(classifyChannel("Whatsapp Pedidos")).toBe("delivery");
    expect(classifyChannel("Delivery Débito")).toBe("delivery");
    expect(classifyChannel("Z-API Link")).toBe("delivery");
    expect(classifyChannel("Motoboy Dinheiro")).toBe("delivery");
  });

  it("deve classificar formas convencionais como balcão", () => {
    expect(classifyChannel("Dinheiro")).toBe("balcao");
    expect(classifyChannel("Pix")).toBe("balcao");
    expect(classifyChannel("Cartão Crédito")).toBe("balcao");
    expect(classifyChannel("Cartão Débito")).toBe("balcao");
    expect(classifyChannel("Outros")).toBe("balcao");
  });
});

describe("classifyAbcProduct", () => {
  it("deve classificar em Classe A e Estrela se volume alto e margem alta", () => {
    const res = classifyAbcProduct(1000, 50, 45); // cumulativePct = 50%, margin = 45%
    expect(res.volumeClass).toBe("A");
    expect(res.matrixCategory).toBe("estrela");
  });

  it("deve classificar em Classe A e Cavalo de Batalha se volume alto e margem baixa", () => {
    const res = classifyAbcProduct(1000, 50, 30); // cumulativePct = 50%, margin = 30%
    expect(res.volumeClass).toBe("A");
    expect(res.matrixCategory).toBe("cavalo_batalha");
  });

  it("deve classificar em Classe B e Estrela/Cavalo de Batalha de acordo com a margem", () => {
    const res1 = classifyAbcProduct(500, 80, 50); // B + margem alta
    expect(res1.volumeClass).toBe("B");
    expect(res1.matrixCategory).toBe("estrela");

    const res2 = classifyAbcProduct(500, 80, 25); // B + margem baixa
    expect(res2.volumeClass).toBe("B");
    expect(res2.matrixCategory).toBe("cavalo_batalha");
  });

  it("deve classificar em Classe C e Quebra-Cabeça se volume baixo e margem alta", () => {
    const res = classifyAbcProduct(100, 95, 60); // C + margem alta
    expect(res.volumeClass).toBe("C");
    expect(res.matrixCategory).toBe("quebra_cabeca");
  });

  it("deve classificar em Classe C e Abacaxi se volume baixo e margem baixa", () => {
    const res = classifyAbcProduct(100, 95, 10); // C + margem baixa
    expect(res.volumeClass).toBe("C");
    expect(res.matrixCategory).toBe("abacaxi");
  });

  it("deve classificar como Classe C se não houver faturamento", () => {
    const res = classifyAbcProduct(0, 0, 50);
    expect(res.volumeClass).toBe("C");
    expect(res.matrixCategory).toBe("quebra_cabeca");
  });
});

describe("calculatePurchaseSuggestion", () => {
  it("deve retornar ok e sugestão zero se estoque estiver confortável", () => {
    // Estoque: 50, Mínimo: 10, Giro semanal: 21 (venda diária = 3)
    // Cobertura: 50 / 3 = 16 dias (confortável, > 7 dias)
    const res = calculatePurchaseSuggestion(50, 10, 21);
    expect(res.coverageDays).toBe(17); // 50 / 3 = 16.666 ~ 17
    expect(res.suggestedQty).toBe(0);
    expect(res.status).toBe("ok");
  });

  it("deve retornar crítico se estoque atual for menor ou igual ao estoque mínimo", () => {
    // Estoque: 5, Mínimo: 10, Giro semanal: 21 (venda diária = 3)
    // Cobertura: 5 / 3 = 2 dias (< 7 dias)
    // Sugestão para 14 dias: (21 * 2) - 5 = 37 unidades
    const res = calculatePurchaseSuggestion(5, 10, 21);
    expect(res.coverageDays).toBe(2);
    expect(res.suggestedQty).toBe(37);
    expect(res.status).toBe("crítico");
  });

  it("deve retornar sugerido se cobertura for menor que 7 dias mas acima do mínimo", () => {
    // Estoque: 15, Mínimo: 10, Giro semanal: 28 (venda diária = 4)
    // Cobertura: 15 / 4 = 4 dias (< 7 dias)
    // Sugestão para 14 dias: (28 * 2) - 15 = 41 unidades
    const res = calculatePurchaseSuggestion(15, 10, 28);
    expect(res.coverageDays).toBe(4);
    expect(res.suggestedQty).toBe(41);
    expect(res.status).toBe("sugerido");
  });

  it("deve lidar com giro zero sem divisão por zero", () => {
    const res = calculatePurchaseSuggestion(10, 5, 0);
    expect(res.coverageDays).toBe(999);
    expect(res.suggestedQty).toBe(0);
    expect(res.status).toBe("ok");
  });
});
