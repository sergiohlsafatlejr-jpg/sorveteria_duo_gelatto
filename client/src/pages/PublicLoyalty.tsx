/**
 * Página pública de consulta de pontos de fidelidade.
 * Acessada via link único: /fidelidade/{token}
 * Não requer login — qualquer pessoa com o link pode consultar.
 */
import { trpc } from "@/lib/trpc";
import { useRoute } from "wouter";
import { Gift, Star, Clock, TrendingUp, CheckCircle, AlertCircle } from "lucide-react";

const typeLabels: Record<string, { label: string; color: string; sign: string }> = {
  earned: { label: "Pontos ganhos", color: "text-green-600", sign: "+" },
  redeemed: { label: "Pontos resgatados", color: "text-purple-600", sign: "-" },
  expired: { label: "Pontos expirados", color: "text-gray-400", sign: "-" },
  manual: { label: "Ajuste manual", color: "text-blue-600", sign: "+" },
};

export default function PublicLoyalty() {
  const [, params] = useRoute("/fidelidade/:token");
  const token = params?.token ?? "";

  const { data: profile, isLoading, error } = trpc.points.getPublicProfile.useQuery(
    { token },
    { enabled: token.length > 10 }
  );

  if (!token || token.length < 10) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-pink-50 to-purple-50 flex items-center justify-center p-4">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
          <p className="text-gray-600">Link inválido</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-pink-50 to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-pink-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-500">Carregando seus pontos...</p>
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-pink-50 to-purple-50 flex items-center justify-center p-4">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
          <p className="text-gray-700 font-medium">Link não encontrado</p>
          <p className="text-gray-500 text-sm mt-1">Este link pode ter expirado ou é inválido.</p>
        </div>
      </div>
    );
  }

  const isGoalReached = profile.totalPoints >= profile.meta;

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 via-white to-purple-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-pink-500 to-purple-600 text-white px-4 py-8 text-center">
        <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3">
          <Gift className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-2xl font-bold">Duo Gelatto</h1>
        <p className="text-pink-100 text-sm mt-1">Cartão de Fidelidade Digital</p>
      </div>

      <div className="max-w-md mx-auto px-4 py-6 space-y-5">
        {/* Saudação */}
        <div className="text-center">
          <p className="text-gray-500 text-sm">Olá,</p>
          <h2 className="text-xl font-bold text-gray-800">{profile.name}</h2>
        </div>

        {/* Card de pontos */}
        <div className={`rounded-2xl p-6 text-white shadow-lg ${isGoalReached
          ? "bg-gradient-to-br from-yellow-400 to-orange-500"
          : "bg-gradient-to-br from-pink-500 to-purple-600"
        }`}>
          {isGoalReached && (
            <div className="flex items-center gap-2 mb-3 bg-white/20 rounded-full px-3 py-1 w-fit">
              <CheckCircle className="w-4 h-4" />
              <span className="text-sm font-medium">Meta atingida! 🎉</span>
            </div>
          )}
          <div className="flex items-end justify-between mb-4">
            <div>
              <p className="text-white/80 text-sm">Seus pontos</p>
              <p className="text-5xl font-bold">{profile.totalPoints}</p>
            </div>
            <Star className="w-10 h-10 text-white/40" />
          </div>

          {/* Barra de progresso */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-white/80">
              <span>{profile.totalPoints} pontos</span>
              <span>Meta: {profile.meta} pontos</span>
            </div>
            <div className="h-3 bg-white/20 rounded-full overflow-hidden">
              <div
                className="h-full bg-white rounded-full transition-all duration-500"
                style={{ width: `${profile.progress}%` }}
              />
            </div>
            <p className="text-xs text-white/80 text-center">
              {isGoalReached
                ? `Você ganhou ${Number(profile.rewardValue) > 0 ? `R$ ${Number(profile.rewardValue).toFixed(2)}` : "uma recompensa"} de desconto!`
                : `Faltam ${profile.faltam} pontos para ganhar ${Number(profile.rewardValue) > 0 ? `R$ ${Number(profile.rewardValue).toFixed(2)}` : "sua recompensa"}`}
            </p>
          </div>
        </div>

        {/* Como funciona */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <h3 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-pink-500" />
            Como funciona
          </h3>
          <div className="space-y-2 text-sm text-gray-600">
            <div className="flex items-start gap-2">
              <span className="w-5 h-5 bg-pink-100 text-pink-600 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">1</span>
              <p>A cada compra na Duo Gelatto, você acumula pontos automaticamente</p>
            </div>
            <div className="flex items-start gap-2">
              <span className="w-5 h-5 bg-pink-100 text-pink-600 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">2</span>
              <p>Ao atingir <strong>{profile.meta} pontos</strong>, você ganha{" "}
                {Number(profile.rewardValue) > 0
                  ? <strong>R$ {Number(profile.rewardValue).toFixed(2)} de desconto</strong>
                  : <strong>uma recompensa especial</strong>}
              </p>
            </div>
            <div className="flex items-start gap-2">
              <span className="w-5 h-5 bg-pink-100 text-pink-600 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">3</span>
              <p>Apresente este link ao atendente para resgatar seu desconto</p>
            </div>
          </div>
        </div>

        {/* Histórico */}
        {profile.history.length > 0 && (
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <h3 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4 text-pink-500" />
              Últimas movimentações
            </h3>
            <div className="space-y-3">
              {profile.history.map((item, i) => {
                const meta = typeLabels[item.type] ?? { label: item.type, color: "text-gray-600", sign: "+" };
                return (
                  <div key={i} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                    <div>
                      <p className="text-sm font-medium text-gray-700">{meta.label}</p>
                      {item.description && (
                        <p className="text-xs text-gray-400">{item.description}</p>
                      )}
                      <p className="text-xs text-gray-400">
                        {item.createdAt ? new Date(item.createdAt).toLocaleDateString("pt-BR") : ""}
                      </p>
                    </div>
                    <span className={`text-base font-bold ${meta.color}`}>
                      {meta.sign}{item.points} pts
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Rodapé */}
        <div className="text-center text-xs text-gray-400 pb-4">
          <p>Duo Gelatto — Programa de Fidelidade</p>
          <p className="mt-1">Guarde este link para consultar seus pontos a qualquer momento</p>
        </div>
      </div>
    </div>
  );
}
