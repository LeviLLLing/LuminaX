import type { Metadata } from 'next';
import { Inspector } from 'react-dev-inspector';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'LuminaX-灵犀经营智能引擎',
    template: '%s | 销售归因分析',
  },
  description:
    'LuminaX-灵犀经营智能引擎 - 自然语言驱动的销售数据看板与智能归因分析',
  keywords: [
    '门店',
    '销售分析',
    '归因分析',
    '数据看板',
  ],
  authors: [{ name: 'Sales Analytics' }],
  generator: 'Next.js',
  // icons: {
  //   icon: '',
  // },
  openGraph: {
    title: 'LuminaX-灵犀经营智能引擎',
    description:
      '自然语言驱动的销售数据看板与智能归因分析',
    url: 'http://localhost:5000',
    siteName: 'LuminaX',
    locale: 'zh_CN',
    type: 'website',
    // images: [
    //   {
    //     url: '',
    //     width: 1200,
    //     height: 630,
    //     alt: '扣子编程 - 你的 AI 工程师',
    //   },
    // ],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const isDev = process.env.NEXT_PUBLIC_ENABLE_INSPECTOR === 'true';

  return (
    <html lang="zh-CN">
      <body className={`antialiased`}>
        {isDev && <Inspector />}
        {children}
      </body>
    </html>
  );
}
