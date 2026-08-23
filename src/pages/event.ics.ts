import { buildIcsResponse } from '../lib/ics';

export function GET() {
  return buildIcsResponse('en');
}
