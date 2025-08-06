import '../styles/globals.css';

export const metadata = {
  title: 'BardFlasher',
  description: 'Active Locked PI Withdrawal Bot',
  icons: {
    icon: '/favicon.ico', // मानकर चल रहे हैं कि favicon.ico public फोल्डर में है
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
