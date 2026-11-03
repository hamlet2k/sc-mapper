import { createHandlers } from './_lib/handler.js';
const handlers = createHandlers({ env: () => process.env });
export async function GET(request: Request) { return handlers.GET(request); }
export async function POST(request: Request) { return handlers.POST(request); }
