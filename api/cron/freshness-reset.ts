import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const RESET_BATCH_SIZE = 50

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

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

  return res.status(200).json({ reset: ids.length })
}
