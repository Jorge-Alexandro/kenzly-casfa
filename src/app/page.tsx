// Root: send everyone to the coordination panel (middleware bounces to /login
// if there's no session).
import { redirect } from 'next/navigation'

export default function Home() {
  redirect('/panel')
}
