/**
 * Traduz mensagens comuns de erro do Supabase Auth para Português,
 * mantendo um fallback genérico para mensagens desconhecidas.
 */
export function translateAuthError(rawMessage: string | undefined | null): string {
  if (!rawMessage) return "Não foi possível concluir a operação. Tente novamente."

  const normalized = rawMessage.toLowerCase()

  if (normalized.includes("invalid login credentials")) {
    return "E-mail ou senha incorretos."
  }
  if (normalized.includes("email not confirmed")) {
    return "Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada."
  }
  if (normalized.includes("user already registered") || normalized.includes("already registered")) {
    return "Já existe uma conta com este e-mail."
  }
  if (normalized.includes("password should be at least")) {
    return "A senha precisa ter pelo menos 8 caracteres."
  }
  if (normalized.includes("invalid email")) {
    return "E-mail inválido."
  }
  if (normalized.includes("rate limit") || normalized.includes("too many")) {
    return "Muitas tentativas. Aguarde alguns minutos antes de tentar novamente."
  }
  if (normalized.includes("network")) {
    return "Falha de rede. Verifique sua conexão e tente novamente."
  }

  return rawMessage
}
