import { ReportsClient } from './reports-client'
export default async function ReportsPage({params}:{params:Promise<{id:string}>}) {
  const {id}=await params
  return <ReportsClient key={id} slug={id}/>
}
