import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Search,
  ExternalLink,
  AlertCircle,
  Info,
  Eye,
  DollarSign,
  Users,
  Calendar,
  Megaphone,
  Globe,
  Smartphone,
  Monitor,
  Settings,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";

// ─── Platform icon helper ─────────────────────────────────────────────────────
function PlatformIcon({ platform }: { platform: string }) {
  if (platform === "instagram") return <Smartphone className="w-3 h-3" />;
  if (platform === "facebook") return <Globe className="w-3 h-3" />;
  return <Monitor className="w-3 h-3" />;
}

// ─── Ad Card ──────────────────────────────────────────────────────────────────
function AdCard({ ad }: { ad: any }) {
  const [expanded, setExpanded] = useState(false);

  const isActive = !ad.deliveryStop;
  const daysRunning = ad.deliveryStart
    ? Math.floor((Date.now() - new Date(ad.deliveryStart).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  return (
    <Card className="bg-card border-border hover:border-primary/40 transition-colors">
      <CardContent className="pt-4 pb-3 px-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-semibold text-sm text-foreground truncate">{ad.pageName}</span>
              <Badge variant={isActive ? "default" : "secondary"} className="text-xs shrink-0">
                {isActive ? "Ativo" : "Inativo"}
              </Badge>
            </div>
            {ad.deliveryStart && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Calendar className="w-3 h-3" />
                <span>
                  Iniciado em {new Date(ad.deliveryStart).toLocaleDateString("pt-BR")}
                  {daysRunning !== null && ` · ${daysRunning} dias no ar`}
                </span>
              </div>
            )}
          </div>
          {ad.snapshotUrl && (
            <a
              href={ad.snapshotUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 text-primary hover:text-primary/80 transition-colors"
              title="Ver anúncio na Ad Library"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          )}
        </div>

        {/* Platforms */}
        {ad.platforms.length > 0 && (
          <div className="flex items-center gap-1.5 mb-3">
            {ad.platforms.map((p: string) => (
              <Badge key={p} variant="outline" className="text-xs gap-1 py-0.5">
                <PlatformIcon platform={p} />
                {p === "instagram" ? "Instagram" : p === "facebook" ? "Facebook" : p}
              </Badge>
            ))}
          </div>
        )}

        {/* Ad body */}
        {ad.bodies.length > 0 && (
          <div className="bg-muted/40 rounded-md p-3 mb-3">
            <p className={`text-sm text-foreground/80 leading-relaxed ${!expanded && "line-clamp-3"}`}>
              {ad.bodies[0]}
            </p>
            {ad.bodies[0]?.length > 200 && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="text-xs text-primary mt-1 hover:underline"
              >
                {expanded ? "Ver menos" : "Ver mais"}
              </button>
            )}
          </div>
        )}

        {/* Link titles */}
        {ad.linkTitles.length > 0 && (
          <p className="text-xs font-semibold text-foreground mb-3 truncate">
            📌 {ad.linkTitles[0]}
          </p>
        )}

        {/* Metrics */}
        <div className="grid grid-cols-3 gap-2">
          {ad.impressions && (
            <div className="bg-muted/30 rounded p-2 text-center">
              <div className="flex items-center justify-center gap-1 text-muted-foreground mb-0.5">
                <Eye className="w-3 h-3" />
                <span className="text-xs">Impressões</span>
              </div>
              <p className="text-xs font-semibold text-foreground">
                {parseInt(ad.impressions.lowerBound ?? "0").toLocaleString("pt-BR")}
                {ad.impressions.upperBound && ` – ${parseInt(ad.impressions.upperBound).toLocaleString("pt-BR")}`}
              </p>
            </div>
          )}
          {ad.spend && (
            <div className="bg-muted/30 rounded p-2 text-center">
              <div className="flex items-center justify-center gap-1 text-muted-foreground mb-0.5">
                <DollarSign className="w-3 h-3" />
                <span className="text-xs">Gasto Est.</span>
              </div>
              <p className="text-xs font-semibold text-foreground">
                R${parseInt(ad.spend.lowerBound ?? "0").toLocaleString("pt-BR")}
                {ad.spend.upperBound && ` – R$${parseInt(ad.spend.upperBound).toLocaleString("pt-BR")}`}
              </p>
            </div>
          )}
          {ad.estimatedAudience && (
            <div className="bg-muted/30 rounded p-2 text-center">
              <div className="flex items-center justify-center gap-1 text-muted-foreground mb-0.5">
                <Users className="w-3 h-3" />
                <span className="text-xs">Audiência</span>
              </div>
              <p className="text-xs font-semibold text-foreground">
                {parseInt(ad.estimatedAudience.lowerBound ?? "0").toLocaleString("pt-BR")}+
              </p>
            </div>
          )}
        </div>

        {/* Target info */}
        {(ad.targetGender || ad.targetAges?.length > 0) && (
          <div className="mt-2 flex flex-wrap gap-1">
            {ad.targetGender && ad.targetGender !== "All" && (
              <Badge variant="outline" className="text-xs">
                {ad.targetGender === "male" ? "Homens" : ad.targetGender === "female" ? "Mulheres" : ad.targetGender}
              </Badge>
            )}
            {ad.targetAges?.map((age: string) => (
              <Badge key={age} variant="outline" className="text-xs">{age} anos</Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function AdLibraryPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeSearch, setActiveSearch] = useState("");
  const [adStatus, setAdStatus] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");
  const [limit, setLimit] = useState(20);

  // Config check
  const { data: config } = trpc.adLibrary.checkConfig.useQuery();
  const { data: competitors } = trpc.adLibrary.getKnownCompetitors.useQuery();

  // Search
  const { data: results, isLoading, error } = trpc.adLibrary.search.useQuery(
    { searchTerms: activeSearch, adActiveStatus: adStatus, limit },
    { enabled: activeSearch.length >= 2 }
  );

  function handleSearch() {
    if (searchTerm.trim().length < 2) {
      toast.error("Busca muito curta", { description: "Digite pelo menos 2 caracteres." });
      return;
    }
    setActiveSearch(searchTerm.trim());
  }

  function handleQuickSearch(query: string) {
    setSearchTerm(query);
    setActiveSearch(query);
  }

  return (
    <DashboardLayout>
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Megaphone className="w-6 h-6 text-primary" />
              Biblioteca de Anúncios — Concorrentes
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Pesquise anúncios ativos de concorrentes usando a Meta Ad Library pública
            </p>
          </div>
        </div>

        {/* Config status */}
        {config && !config.configured && (
          <Alert>
            <Settings className="w-4 h-4" />
            <AlertTitle>Token da Meta Ad Library não configurado</AlertTitle>
            <AlertDescription className="space-y-2">
              <p>
                Para buscar anúncios de concorrentes, você precisa de um <strong>Token de Acesso do Meta</strong>.
                Siga os passos abaixo:
              </p>
              <ol className="list-decimal list-inside space-y-1 text-sm">
                <li>
                  Acesse{" "}
                  <a href="https://developers.facebook.com" target="_blank" rel="noopener noreferrer" className="text-primary underline">
                    developers.facebook.com
                  </a>{" "}
                  e crie um App (tipo: Negócios)
                </li>
                <li>Vá em <strong>Ferramentas → Explorador de API do Graph</strong></li>
                <li>Gere um token de usuário com permissão <code>ads_read</code></li>
                <li>Configure a variável de ambiente <code>META_AD_LIBRARY_TOKEN</code> nas configurações do sistema</li>
              </ol>
              <p className="text-xs text-muted-foreground">
                Nota: A Meta Ad Library é pública — você pode visualizar anúncios de qualquer página sem precisar ser concorrente.
              </p>
            </AlertDescription>
          </Alert>
        )}

        {/* Info banner */}
        <Alert variant="default" className="border-blue-500/30 bg-blue-500/5">
          <Info className="w-4 h-4 text-blue-500" />
          <AlertTitle className="text-blue-600 dark:text-blue-400">O que você pode ver</AlertTitle>
          <AlertDescription className="text-sm">
            A Meta Ad Library mostra todos os anúncios ativos de qualquer página do Facebook/Instagram no Brasil.
            Você pode ver o texto, formato, plataformas, estimativa de impressões e gasto — mas <strong>não</strong> dados de performance internos (CTR, conversões, ROAS).
            Isso é suficiente para entender a estratégia criativa dos concorrentes.
          </AlertDescription>
        </Alert>

        {/* Search bar */}
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex gap-3 mb-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Ex: açaí goiânia, sorvete artesanal, gelato..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  className="pl-9"
                />
              </div>
              <Select value={adStatus} onValueChange={(v) => setAdStatus(v as any)}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todos</SelectItem>
                  <SelectItem value="ACTIVE">Apenas ativos</SelectItem>
                  <SelectItem value="INACTIVE">Apenas inativos</SelectItem>
                </SelectContent>
              </Select>
              <Select value={String(limit)} onValueChange={(v) => setLimit(Number(v))}>
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10 anúncios</SelectItem>
                  <SelectItem value="20">20 anúncios</SelectItem>
                  <SelectItem value="50">50 anúncios</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={handleSearch} disabled={isLoading}>
                <Search className="w-4 h-4 mr-2" />
                Buscar
              </Button>
            </div>

            {/* Quick search — known competitors */}
            {competitors && competitors.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-2 font-medium">Busca rápida — concorrentes conhecidos:</p>
                <div className="flex flex-wrap gap-2">
                  {competitors.map((c) => (
                    <button
                      key={c.name}
                      onClick={() => handleQuickSearch(c.query)}
                      className="flex items-center gap-1.5 text-xs bg-muted hover:bg-muted/80 text-foreground px-3 py-1.5 rounded-full transition-colors border border-border hover:border-primary/40"
                    >
                      <ChevronRight className="w-3 h-3 text-primary" />
                      {c.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Results */}
        {isLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="pt-4">
                  <Skeleton className="h-4 w-2/3 mb-2" />
                  <Skeleton className="h-3 w-1/3 mb-4" />
                  <Skeleton className="h-16 w-full mb-3" />
                  <div className="grid grid-cols-3 gap-2">
                    <Skeleton className="h-12" />
                    <Skeleton className="h-12" />
                    <Skeleton className="h-12" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="w-4 h-4" />
            <AlertTitle>Erro na busca</AlertTitle>
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        )}

        {results && !isLoading && (
          <>
            {results.message && (
              <Alert variant={results.configured ? "destructive" : "default"}>
                <AlertCircle className="w-4 h-4" />
                <AlertDescription>{results.message}</AlertDescription>
              </Alert>
            )}

            {results.ads.length > 0 && (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    <span className="font-semibold text-foreground">{results.total}</span> anúncios encontrados para{" "}
                    <span className="font-semibold text-primary">"{activeSearch}"</span>
                  </p>
                  <a
                    href={`https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=BR&q=${encodeURIComponent(activeSearch)}&search_type=keyword_unordered`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline flex items-center gap-1"
                  >
                    Ver na Ad Library oficial
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {results.ads.map((ad: any) => (
                    <AdCard key={ad.id} ad={ad} />
                  ))}
                </div>
              </>
            )}

            {results.ads.length === 0 && activeSearch && !results.message && (
              <div className="text-center py-12 text-muted-foreground">
                <Megaphone className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="font-medium">Nenhum anúncio encontrado</p>
                <p className="text-sm mt-1">Tente outros termos ou verifique se o token está configurado corretamente.</p>
                <a
                  href={`https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=BR&q=${encodeURIComponent(activeSearch)}&search_type=keyword_unordered`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-primary hover:underline mt-3"
                >
                  Buscar diretamente na Meta Ad Library
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            )}

            {!activeSearch && (
              <div className="text-center py-12 text-muted-foreground">
                <Search className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="font-medium">Digite um termo para buscar</p>
                <p className="text-sm mt-1">
                  Ex: nome do concorrente, tipo de produto, localização
                </p>
              </div>
            )}
          </>
        )}

        {!results && !isLoading && !activeSearch && (
          <div className="text-center py-12 text-muted-foreground">
            <Search className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Pesquise anúncios de concorrentes</p>
            <p className="text-sm mt-1">
              Use os atalhos acima ou digite o nome de qualquer empresa para ver seus anúncios ativos
            </p>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
