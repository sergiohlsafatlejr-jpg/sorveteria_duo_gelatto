/**
 * Z-API WhatsApp Service
 * Handles all communication with Z-API REST endpoints.
 * Docs: https://developer.z-api.io/
 */

const ZAPI_BASE = "https://api.z-api.io";

export interface ZApiConfig {
  instanceId: string;
  token: string;
}

export interface SendMessageResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Format phone number to Z-API format (55 + DDD + number, digits only)
 */
export function formatPhone(phone: string): string {
  // Remove all non-digits
  const digits = phone.replace(/\D/g, "");
  // If already starts with 55 and has 12-13 digits, use as-is
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  // If 10-11 digits (Brazilian number without country code), prepend 55
  if (digits.length >= 10 && digits.length <= 11) return `55${digits}`;
  return digits;
}

/**
 * Send a text message via Z-API
 */
export async function sendWhatsAppMessage(
  config: ZApiConfig,
  phone: string,
  message: string
): Promise<SendMessageResult> {
  const formattedPhone = formatPhone(phone);
  const url = `${ZAPI_BASE}/instances/${config.instanceId}/token/${config.token}/send-text`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: formattedPhone,
        message,
      }),
    });

    const data = await response.json() as { zaapId?: string; messageId?: string; error?: string };

    if (!response.ok) {
      return { success: false, error: data.error ?? `HTTP ${response.status}` };
    }

    return { success: true, messageId: data.zaapId ?? data.messageId };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

/**
 * Check if Z-API instance is connected
 */
export async function checkZApiConnection(config: ZApiConfig): Promise<{
  connected: boolean;
  phone?: string;
  error?: string;
}> {
  const url = `${ZAPI_BASE}/instances/${config.instanceId}/token/${config.token}/status`;

  try {
    const response = await fetch(url);
    const data = await response.json() as { connected?: boolean; phone?: string; error?: string; value?: string };

    if (!response.ok) {
      return { connected: false, error: data.error ?? `HTTP ${response.status}` };
    }

    // Z-API returns { value: "CONNECTED" } or { connected: true }
    const isConnected = data.connected === true || data.value === "CONNECTED";
    return { connected: isConnected, phone: data.phone };
  } catch (err) {
    return { connected: false, error: err instanceof Error ? err.message : "Connection failed" };
  }
}

/**
 * Replace template variables in message
 * Available vars: {{nome}}, {{pontos}}, {{meta}}, {{faltam}}, {{recompensa}}
 */
export function buildMessage(template: string, vars: Record<string, string | number>): string {
  let msg = template;
  for (const [key, value] of Object.entries(vars)) {
    msg = msg.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), String(value));
  }
  return msg;
}

/**
 * Default message templates
 */
export const DEFAULT_TEMPLATES = {
  pointsEarned: `🍦 *Duo Gelatto* — Programa de Pontos

Olá, {{nome}}! 😊

Você acabou de ganhar *{{pontos}} pontos* na sua compra!

📊 Seu saldo atual: *{{saldo}} pontos*
🎯 Meta para resgate: *{{meta}} pontos*
📍 Faltam apenas *{{faltam}} pontos* para ganhar seu desconto!

Obrigado pela preferência! 💜`,

  goalNear: `🍦 *Duo Gelatto* — Quase lá!

Oi, {{nome}}! 🎉

Você está *muito perto* de ganhar seu desconto!

📊 Seu saldo: *{{saldo}} pontos*
🎯 Meta: *{{meta}} pontos*
⚡ Faltam apenas *{{faltam}} pontos!*

Venha nos visitar e complete sua meta! 🏆`,

  goalReached: `🍦 *Duo Gelatto* — Parabéns! 🎊

{{nome}}, você atingiu sua meta de pontos!

🏆 Você ganhou *R$ {{recompensa}}* de desconto!

Apresente esta mensagem no caixa para resgatar seu prêmio. 🎁

Válido na próxima visita. Obrigado pela fidelidade! 💜`,

  promotion: `🍦 *Duo Gelatto* — Promoção Especial! 🎉

Olá, {{nome}}!

{{mensagem}}

Venha nos visitar! 😊
📍 Duo Gelatto — Goiânia/GO`,
};
