import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { RefreshCw, Play, Clock, CheckCircle2, XCircle, SkipForward, ArrowLeft } from "lucide-react";
import { Link } from "wouter";

export default function CronJobs() {
  const [isTriggering, setIsTriggering] = useState(false);

  const { data: logs, isLoading, refetch } = trpc.cron.getLogs.useQuery({ limit: 50 });

  const triggerMutation = trpc.cron.triggerSyncRevenue.useMutation({
    onMutate: () => setIsTriggering(true),
    onSuccess: () => {
      toast.success("✅ Sincronização iniciada", { description: "O faturamento do dia anterior foi importado do INOVE PDV." });
      refetch();
      setIsTriggering(false);
    },
    onError: (err) => {
      toast.error("❌ Erro na sincronização", { description: err.message });
      setIsTriggering(false);
    },
  });

  const statusIcon = (status: string) => {
    if (status === "success") return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    if (status === "error") return <XCircle className="h-4 w-4 text-red-500" />;
    return <SkipForward className="h-4 w-4 text-yellow-500" />;
  };

  const statusBadge = (status: string) => {
    if (status === "success") return <Badge className="bg-green-100 text-green-800 border-green-200">Sucesso</Badge>;
    if (status === "error") return <Badge className="bg-red-100 text-red-800 border-red-200">Erro</Badge>;
    return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">Pulado</Badge>;
  };

  const jobLabel = (name: string) => {
    if (name === "sync-daily-revenue") return "Importar Faturamento INOVE";
    return name;
  };

  const formatDuration = (ms: number | null | undefined) => {
    if (!ms) return "—";
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/dashboard">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Clock className="h-6 w-6 text-primary" />
            Agendamentos Automáticos
          </h1>
          <p className="text-muted-foreground text-sm">Tarefas que executam automaticamente em horários programados</p>
        </div>
      </div>

      {/* Cards de tarefas agendadas */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <Card className="border-l-4 border-l-primary">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="text-base">Importar Faturamento INOVE</CardTitle>
                <CardDescription className="text-xs mt-1">
                  Busca as vendas do dia anterior no PDV INOVE e registra automaticamente na Previsão de Faturamento
                </CardDescription>
              </div>
              <Badge variant="outline" className="text-xs shrink-0">Ativo</Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                <span>Todos os dias às <strong>08:00</strong> (Brasília)</span>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => triggerMutation.mutate()}
                disabled={isTriggering}
                className="gap-1.5"
              >
                {isTriggering ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Play className="h-3.5 w-3.5" />
                )}
                {isTriggering ? "Executando..." : "Executar agora"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Histórico de execuções */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold">Histórico de Execuções</h2>
        <Button variant="ghost" size="sm" onClick={() => refetch()} className="gap-1.5">
          <RefreshCw className="h-4 w-4" />
          Atualizar
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <RefreshCw className="h-5 w-5 animate-spin mr-2" />
              Carregando histórico...
            </div>
          ) : !logs || logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Clock className="h-10 w-10 mb-3 opacity-30" />
              <p className="font-medium">Nenhuma execução registrada ainda</p>
              <p className="text-sm mt-1">A primeira execução automática ocorrerá amanhã às 08:00</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4 gap-1.5"
                onClick={() => triggerMutation.mutate()}
                disabled={isTriggering}
              >
                <Play className="h-3.5 w-3.5" />
                Executar agora para testar
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Tarefa</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Mensagem</TableHead>
                  <TableHead className="text-right">Duração</TableHead>
                  <TableHead className="text-right">Executado em</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell>{statusIcon(log.status)}</TableCell>
                    <TableCell className="font-medium text-sm">{jobLabel(log.jobName)}</TableCell>
                    <TableCell>{statusBadge(log.status)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                      {log.message ?? "—"}
                    </TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">
                      {formatDuration(log.durationMs)}
                    </TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground whitespace-nowrap">
                      {new Date(log.executedAt).toLocaleString("pt-BR")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
