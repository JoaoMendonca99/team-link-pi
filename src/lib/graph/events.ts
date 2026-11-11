export const RECOMMENDATIONS_CHANGED = 'team-link:graph-changed'
export const RECOMMENDATION_PRIVACY_CHANGED = 'team-link:recommendation-privacy-changed'
export const RECOMMENDATION_ACCESS_CHANGED = 'team-link:recommendation-access-changed'

export function notifyRecommendations(event = RECOMMENDATIONS_CHANGED) {
  window.dispatchEvent(new Event(event))
  try { localStorage.setItem(event, crypto.randomUUID()) } catch { /* focus revalidation remains available */ }
}
