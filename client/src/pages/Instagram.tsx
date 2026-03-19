import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import BackButton from "@/components/BackButton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Instagram, Image, BarChart2, RefreshCw, Trash2, Send, Plus,
  Heart, Eye, MessageCircle, Users, ExternalLink, CheckCircle, AlertCircle, Clock
} from "lucide-react";

type PostType = "post" | "story" | "reels";

const STATUS_LABELS: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  draft: { label: "Rascunho", color: "bg-gray-100 text-gray-700", icon: <Clock className="w-3 h-3" /> },
  published: { label: "Publicado", color: "bg-green-100 text-green-700", icon: <CheckCircle className="w-3 h-3" /> },
  failed: { label: "Falhou", color: "bg-red-100 text-red-700", icon: <AlertCircle className="w-3 h-3" /> },
};

const TYPE_LABELS: Record<string, string> = {
  post: "Post",
  story: "Story",
  reels: "Reels",
};

export default function InstagramPage() {
  const [activeTab, setActiveTab] = useState("feed");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [publishingId, setPublishingId] = useState<number | null>(null);
  const [newPost, setNewPost] = useState({
    type: "post" as PostType,
    caption: "",
    imageUrl: "",
    promotionTitle: "",
  });

  // Queries
  const accountQuery = trpc.instagram.getAccountInfo.useQuery();
  const postsQuery = trpc.instagram.getPosts.useQuery();
  const recentQuery = trpc.instagram.getRecentPosts.useQuery({ limit: 10 });

  // Mutations
  const createDraftMut = trpc.instagram.createDraft.useMutation({
    onSuccess: () => {
      toast.success("Rascunho criado com sucesso!");
      postsQuery.refetch();
      setShowCreateModal(false);
      setNewPost({ type: "post", caption: "", imageUrl: "", promotionTitle: "" });
    },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  });

  const publishMut = trpc.instagram.publishPost.useMutation({
    onSuccess: () => {
      toast.success("Post enviado para publicação! Confirme na UI do Manus.");
      postsQuery.refetch();
      setPublishingId(null);
    },
    onError: (e) => {
      toast.error(`Erro ao publicar: ${e.message}`);
      setPublishingId(null);
    },
  });

  const deleteMut = trpc.instagram.deleteDraft.useMutation({
    onSuccess: () => {
      toast.success("Rascunho excluído.");
      postsQuery.refetch();
    },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  });

  const syncMut = trpc.instagram.syncMetrics.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.updated} post(s) atualizado(s).`);
      postsQuery.refetch();
    },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  });

  const handlePublish = (postId: number) => {
    setPublishingId(postId);
    publishMut.mutate({ postId });
  };

  const account = accountQuery.data as {
    username?: string; name?: string; followers?: number; posts?: number; bio?: string; profile_picture?: string
  } | null;

  const localPosts = postsQuery.data ?? [];
  const recentPosts = (recentQuery.data as { data?: unknown[] } | null)?.data ?? [];

  const drafts = localPosts.filter(p => p.status === "draft");
  const published = localPosts.filter(p => p.status === "published");

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <BackButton />
        <div className="flex items-center gap-2">
          <Instagram className="w-7 h-7 text-pink-500" />
          <div>
            <h1 className="text-2xl font-bold">Instagram</h1>
            <p className="text-sm text-muted-foreground">Gerencie posts e promoções da Duo Gelatto</p>
          </div>
        </div>
      </div>

      {/* Conta conectada */}
      {account && (
        <Card className="border-pink-200 bg-gradient-to-r from-pink-50 to-purple-50">
          <CardContent className="pt-4">
            <div className="flex items-center gap-4">
              {account.profile_picture && (
                <img src={account.profile_picture} alt="Perfil" className="w-14 h-14 rounded-full border-2 border-pink-300" />
              )}
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-lg">@{account.username}</span>
                  <Badge className="bg-pink-100 text-pink-700 border-pink-200">Conectado</Badge>
                </div>
                <p className="text-sm text-muted-foreground">{account.name}</p>
              </div>
              <div className="flex gap-6 text-center">
                <div>
                  <p className="text-xl font-bold text-pink-600">{account.followers?.toLocaleString("pt-BR")}</p>
                  <p className="text-xs text-muted-foreground">Seguidores</p>
                </div>
                <div>
                  <p className="text-xl font-bold text-purple-600">{account.posts}</p>
                  <p className="text-xs text-muted-foreground">Posts</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {!account && !accountQuery.isLoading && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3 text-yellow-800">
              <AlertCircle className="w-5 h-5" />
              <div>
                <p className="font-semibold">Instagram não conectado</p>
                <p className="text-sm">Acesse as Configurações do Manus → Integrações → Instagram para conectar a conta da Duo Gelatto.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="feed" className="flex items-center gap-1">
              <Image className="w-4 h-4" /> Feed
            </TabsTrigger>
            <TabsTrigger value="drafts" className="flex items-center gap-1">
              <Clock className="w-4 h-4" /> Rascunhos
              {drafts.length > 0 && (
                <Badge className="ml-1 bg-orange-100 text-orange-700 text-xs px-1">{drafts.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="metrics" className="flex items-center gap-1">
              <BarChart2 className="w-4 h-4" /> Métricas
            </TabsTrigger>
          </TabsList>
          <Button onClick={() => setShowCreateModal(true)} className="bg-gradient-to-r from-pink-500 to-purple-600 text-white hover:from-pink-600 hover:to-purple-700">
            <Plus className="w-4 h-4 mr-1" /> Criar Post
          </Button>
        </div>

        {/* Feed — posts recentes do Instagram */}
        <TabsContent value="feed" className="mt-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-lg">Posts Recentes no Instagram</h2>
            <Button variant="outline" size="sm" onClick={() => recentQuery.refetch()}>
              <RefreshCw className="w-4 h-4 mr-1" /> Atualizar
            </Button>
          </div>

          {recentQuery.isLoading && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="aspect-square bg-gray-100 rounded-xl animate-pulse" />
              ))}
            </div>
          )}

          {!recentQuery.isLoading && recentPosts.length === 0 && (
            <div className="text-center py-16 text-muted-foreground">
              <Instagram className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Nenhum post encontrado.</p>
              <p className="text-sm">Conecte o Instagram da Duo Gelatto para ver o feed.</p>
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {(recentPosts as Array<{
              id: string; thumbnail_url?: string; media_url?: string; media_type?: string;
              timestamp?: string; like_count?: number; comments_count?: number; permalink?: string
            }>).map((post) => (
              <div key={post.id} className="group relative aspect-square rounded-xl overflow-hidden bg-gray-100 cursor-pointer">
                {(post.thumbnail_url || post.media_url) && (
                  <img
                    src={post.thumbnail_url ?? post.media_url}
                    alt="Post"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                  />
                )}
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 text-white">
                  <div className="flex items-center gap-3 text-sm font-semibold">
                    <span className="flex items-center gap-1"><Heart className="w-4 h-4" /> {post.like_count ?? 0}</span>
                    <span className="flex items-center gap-1"><MessageCircle className="w-4 h-4" /> {post.comments_count ?? 0}</span>
                  </div>
                  {post.permalink && (
                    <a href={post.permalink} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs underline">
                      <ExternalLink className="w-3 h-3" /> Ver no Instagram
                    </a>
                  )}
                </div>
                <div className="absolute top-2 right-2">
                  <Badge className="bg-black/60 text-white text-xs">{post.media_type ?? "POST"}</Badge>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        {/* Rascunhos */}
        <TabsContent value="drafts" className="mt-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-lg">Rascunhos e Publicados</h2>
          </div>

          {localPosts.length === 0 && (
            <div className="text-center py-16 text-muted-foreground">
              <Image className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Nenhum rascunho criado ainda.</p>
              <p className="text-sm">Clique em "Criar Post" para começar.</p>
            </div>
          )}

          <div className="space-y-3">
            {localPosts.map((post) => {
              const statusInfo = STATUS_LABELS[post.status] ?? STATUS_LABELS.draft;
              return (
                <Card key={post.id} className="overflow-hidden">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4">
                      {post.imageUrl && (
                        <img
                          src={post.imageUrl}
                          alt="Preview"
                          className="w-20 h-20 rounded-lg object-cover flex-shrink-0 border"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline" className="text-xs">{TYPE_LABELS[post.type] ?? post.type}</Badge>
                          <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${statusInfo.color}`}>
                            {statusInfo.icon} {statusInfo.label}
                          </span>
                          {post.promotionTitle && (
                            <span className="text-xs text-muted-foreground truncate">📣 {post.promotionTitle}</span>
                          )}
                        </div>
                        {post.caption && (
                          <p className="text-sm text-muted-foreground line-clamp-2">{post.caption}</p>
                        )}
                        {post.status === "published" && (
                          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1"><Heart className="w-3 h-3 text-red-400" /> {post.likes ?? 0}</span>
                            <span className="flex items-center gap-1"><Eye className="w-3 h-3 text-blue-400" /> {post.reach ?? 0}</span>
                            <span className="flex items-center gap-1"><Users className="w-3 h-3 text-purple-400" /> {post.impressions ?? 0}</span>
                          </div>
                        )}
                        {post.errorMessage && (
                          <p className="text-xs text-red-500 mt-1">Erro: {post.errorMessage}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {post.status === "draft" && (
                          <Button
                            size="sm"
                            className="bg-gradient-to-r from-pink-500 to-purple-600 text-white"
                            onClick={() => handlePublish(post.id)}
                            disabled={publishingId === post.id}
                          >
                            {publishingId === post.id ? (
                              <RefreshCw className="w-4 h-4 animate-spin" />
                            ) : (
                              <><Send className="w-4 h-4 mr-1" /> Publicar</>
                            )}
                          </Button>
                        )}
                        {post.status === "draft" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-red-500 hover:bg-red-50"
                            onClick={() => deleteMut.mutate({ postId: post.id })}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* Métricas */}
        <TabsContent value="metrics" className="mt-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-lg">Métricas dos Posts Publicados</h2>
            <Button variant="outline" size="sm" onClick={() => syncMut.mutate()} disabled={syncMut.isPending}>
              <RefreshCw className={`w-4 h-4 mr-1 ${syncMut.isPending ? "animate-spin" : ""}`} />
              Sincronizar Métricas
            </Button>
          </div>

          {published.length === 0 && (
            <div className="text-center py-16 text-muted-foreground">
              <BarChart2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Nenhum post publicado ainda.</p>
              <p className="text-sm">Crie e publique posts para ver as métricas aqui.</p>
            </div>
          )}

          {published.length > 0 && (
            <>
              {/* KPIs totais */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                {[
                  { label: "Total de Curtidas", value: published.reduce((s, p) => s + (p.likes ?? 0), 0), icon: <Heart className="w-5 h-5 text-red-400" />, color: "text-red-600" },
                  { label: "Alcance Total", value: published.reduce((s, p) => s + (p.reach ?? 0), 0), icon: <Eye className="w-5 h-5 text-blue-400" />, color: "text-blue-600" },
                  { label: "Impressões", value: published.reduce((s, p) => s + (p.impressions ?? 0), 0), icon: <Users className="w-5 h-5 text-purple-400" />, color: "text-purple-600" },
                  { label: "Comentários", value: published.reduce((s, p) => s + (p.comments ?? 0), 0), icon: <MessageCircle className="w-5 h-5 text-green-400" />, color: "text-green-600" },
                ].map((kpi) => (
                  <Card key={kpi.label}>
                    <CardContent className="pt-4 pb-3">
                      <div className="flex items-center gap-2 mb-1">{kpi.icon}<span className="text-xs text-muted-foreground">{kpi.label}</span></div>
                      <p className={`text-2xl font-bold ${kpi.color}`}>{kpi.value.toLocaleString("pt-BR")}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Tabela de posts */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Desempenho por Post</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {published.map((post) => (
                      <div key={post.id} className="flex items-center gap-4 p-3 rounded-lg bg-muted/40">
                        {post.imageUrl && (
                          <img src={post.imageUrl} alt="" className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{post.promotionTitle ?? post.caption?.slice(0, 50) ?? "Post sem título"}</p>
                          <p className="text-xs text-muted-foreground">
                            {post.publishedAt ? new Date(post.publishedAt).toLocaleDateString("pt-BR") : "—"}
                          </p>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground flex-shrink-0">
                          <span className="flex items-center gap-1"><Heart className="w-3.5 h-3.5 text-red-400" /> {post.likes ?? 0}</span>
                          <span className="flex items-center gap-1"><Eye className="w-3.5 h-3.5 text-blue-400" /> {post.reach ?? 0}</span>
                          <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5 text-purple-400" /> {post.impressions ?? 0}</span>
                          <span className="flex items-center gap-1"><MessageCircle className="w-3.5 h-3.5 text-green-400" /> {post.comments ?? 0}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* Modal Criar Post */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Instagram className="w-5 h-5 text-pink-500" />
              Criar Post de Promoção
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Título da Promoção</Label>
              <Input
                placeholder="Ex: Sorvete 2 por 1 no domingo!"
                value={newPost.promotionTitle}
                onChange={(e) => setNewPost(p => ({ ...p, promotionTitle: e.target.value }))}
              />
            </div>

            <div>
              <Label>Tipo de Conteúdo</Label>
              <Select value={newPost.type} onValueChange={(v) => setNewPost(p => ({ ...p, type: v as PostType }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="post">Post (Feed)</SelectItem>
                  <SelectItem value="story">Story</SelectItem>
                  <SelectItem value="reels">Reels</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>URL da Imagem</Label>
              <Input
                placeholder="https://..."
                value={newPost.imageUrl}
                onChange={(e) => setNewPost(p => ({ ...p, imageUrl: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground mt-1">
                A imagem precisa ser uma URL pública acessível. Use o CDN do Manus para fazer upload.
              </p>
            </div>

            {newPost.imageUrl && (
              <div className="rounded-lg overflow-hidden border aspect-square max-h-48 flex items-center justify-center bg-gray-50">
                <img src={newPost.imageUrl} alt="Preview" className="max-h-48 object-contain" onError={(e) => (e.currentTarget.style.display = "none")} />
              </div>
            )}

            <div>
              <Label>Legenda (Caption)</Label>
              <Textarea
                placeholder="Escreva a legenda do post... Use emojis e hashtags! 🍦 #duogelatto #sorvete #goiania"
                value={newPost.caption}
                onChange={(e) => setNewPost(p => ({ ...p, caption: e.target.value }))}
                rows={4}
                maxLength={2200}
              />
              <p className="text-xs text-muted-foreground mt-1 text-right">{newPost.caption.length}/2200</p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateModal(false)}>Cancelar</Button>
            <Button
              className="bg-gradient-to-r from-pink-500 to-purple-600 text-white"
              onClick={() => {
                if (!newPost.imageUrl) { toast.error("Informe a URL da imagem"); return; }
                createDraftMut.mutate(newPost);
              }}
              disabled={createDraftMut.isPending}
            >
              {createDraftMut.isPending ? <RefreshCw className="w-4 h-4 animate-spin mr-1" /> : <Plus className="w-4 h-4 mr-1" />}
              Salvar Rascunho
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
