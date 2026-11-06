import type {Metadata} from 'next'
import {MySpaceClient} from './my-space-client'
export const metadata:Metadata={title:'Meu Espaço',robots:{index:false,follow:false}}
export default function MySpacePage(){return <MySpaceClient/>}
