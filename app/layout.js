import '../styles/globals.css';
import { Inter } from 'next/font/google'; // Google Font को इम्पोर्ट किया

// फॉन्ट को कॉन्फ़िगर किया
const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  title: 'BardFlasher',
  description: 'Active Locked PI Withdrawal Bot',
  icons: {
    icon: '/favicon.ico',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      {/* फॉन्ट को <body> टैग पर लागू कर दिया */}
      <body className={inter.className}>{children}</body>
    </html>
  );
}
