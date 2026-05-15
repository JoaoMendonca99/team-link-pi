import { PublicProfileClient } from './public-profile-client'

type Params = Promise<{ id: string }>

export default async function PublicProfilePage({ params }: { params: Params }) {
  const { id } = await params
  return <PublicProfileClient userId={id} />
}
