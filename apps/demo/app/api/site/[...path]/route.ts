import { backend } from '@/lib/story';

export const dynamic = 'force-dynamic';

async function handle(request: Request): Promise<Response> {
  const { siteHandler } = await backend();
  return siteHandler(request);
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
