import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/admin/', '/practice/', '/progress/', '/settings/', '/auth/', '/banned', '/suspended'],
      },
    ],
    sitemap: 'https://heydpe.com/sitemap.xml',
  };
}
