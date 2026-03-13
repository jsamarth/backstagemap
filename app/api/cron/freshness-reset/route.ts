import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const RESET_BATCH_SIZE = 50

export async function GET(request: NextRequest) {
  if (request.headers.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Select oldest-extracted venues to reset first
  const { data: venues } = await supabase
    .from('venues')
    .select('id')
    .eq('scrape_status', 'extracted')
    .order('extracted_at', { ascending: true })
    .limit(RESET_BATCH_SIZE)

  const ids = (venues ?? []).map(v => v.id)

  if (ids.length > 0) {
    await supabase
      .from('venues')
      .update({ scrape_status: 'not_started' as any })
      .in('id', ids)
  }

  await supabase.from('scrape_logs').insert({
    workflow: 'freshness_reset',
    status:   'success',
    error:    `${ids.length} venues reset to not_started`,
  })

  return NextResponse.json({ reset: ids.length })
}
