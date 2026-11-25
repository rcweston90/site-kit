import { backend } from '@/lib/story';

export const dynamic = 'force-dynamic';

async function handle(request: Request): Promise<Response> {
  const { story } = await backend();
  return story.handle(request);
}

export const GET = handle;
export const HEAD = handle;
export const POST = handle;
export const DELETE = handle;
