import { Suspense } from 'react'
import { ProfileContent } from './profile-content'
export default function ProfilePage() { return <Suspense fallback={<p role="status">Carregando perfil…</p>}><main><ProfileContent /></main></Suspense> }
