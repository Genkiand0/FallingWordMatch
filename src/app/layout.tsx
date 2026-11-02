import type { Viewport } from 'next'
import './globals.css'

export const metadata = { title: 'Falling Word Match' }

export const viewport: Viewport = {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    viewportFit: 'cover',
}
// technical approach: width=device-width stops mobile Safari rendering a 980px desktop
// page scaled down, and maximumScale 1 stops pinch zoom shifting the board.
// viewportFit cover lets the cream background reach under the notch

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en">
            <body>{children}</body>
        </html>
    )
}
