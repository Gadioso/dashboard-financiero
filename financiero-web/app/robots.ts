import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: ['/', '/producto', '/nosotros', '/seguridad', '/privacy', '/terms'],
      disallow: ['/dashboard', '/onboarding', '/bank', '/api'],
    },
    sitemap: 'https://virafi.com/sitemap.xml',
  };
}
