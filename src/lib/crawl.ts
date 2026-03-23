const APIFY_KEY     = process.env.APIFY_API_KEY
const FIRECRAWL_KEY = process.env.FIRECRAWL_API_KEY

const APIFY_ACTOR   = 'apify~website-content-crawler'
const POLL_INTERVAL = 5_000
const MAX_POLLS     = 36  // 3 min max

class ApifyUnavailableError extends Error {}

async function tryApify(url: string, singlePage = false): Promise<string> {
  const startRes = await fetch(
    `https://api.apify.com/v2/acts/${APIFY_ACTOR}/runs?maxTotalChargeUsd=0.06`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${APIFY_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        startUrls:            [{ url }],
        maxCrawlPages:        singlePage ? 1 : 10,
        maxCrawlDepth:        singlePage ? 0 : 10,
        respectRobotsTxtFile: true,
      }),
    }
  )

  if (startRes.status === 402) throw new ApifyUnavailableError('Apify: insufficient credits (HTTP 402)')
  if (startRes.status === 403) throw new ApifyUnavailableError('Apify: platform feature disabled (HTTP 403)')

  const startData = await startRes.json()
  if (startData?.error?.type === 'insufficient-funds') {
    throw new ApifyUnavailableError(`Apify: insufficient credits — ${startData.error.message}`)
  }
  if (startData?.error?.type === 'platform-feature-disabled') {
    throw new ApifyUnavailableError(`Apify: platform feature disabled — ${startData.error.message}`)
  }
  if (!startRes.ok) throw new Error(`Apify run start failed (${startRes.status}): ${JSON.stringify(startData)}`)

  const runId: string = startData.data?.id
  if (!runId) throw new Error('Apify: no runId in response')

  for (let poll = 0; poll < MAX_POLLS; poll++) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL))
    const statusData = await fetch(
      `https://api.apify.com/v2/actor-runs/${runId}`,
      { headers: { Authorization: `Bearer ${APIFY_KEY}` } }
    ).then(r => r.json())
    const status: string = statusData.data?.status
    if (status === 'SUCCEEDED') break
    if (status === 'FAILED' || status === 'ABORTED')
      throw new Error(`Apify run ${status.toLowerCase()} (runId=${runId})`)
  }

  const items = await fetch(
    `https://api.apify.com/v2/actor-runs/${runId}/dataset/items`,
    { headers: { Authorization: `Bearer ${APIFY_KEY}` } }
  ).then(r => r.json()) as Array<{ text?: string; markdown?: string }>

  const markdown = items.map(i => i.markdown ?? i.text ?? '').filter(Boolean).join('\n\n---\n\n')
  if (!markdown) throw new Error('Apify: crawl returned no content')
  return markdown
}

async function tryFirecrawl(url: string): Promise<string> {
  const crawlRes = await fetch('https://api.firecrawl.dev/v1/crawl', {
    method: 'POST',
    headers: { Authorization: `Bearer ${FIRECRAWL_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, limit: 20, scrapeOptions: { formats: ['markdown'], onlyMainContent: false } }),
  })
  const crawlData = await crawlRes.json()
  if (!crawlData.success) throw new Error(crawlData.error ?? 'Firecrawl crawl start failed')
  const crawlId: string = crawlData.id

  let markdown = ''
  for (let poll = 0; poll < MAX_POLLS; poll++) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL))
    const status = await fetch(`https://api.firecrawl.dev/v1/crawl/${crawlId}`, {
      headers: { Authorization: `Bearer ${FIRECRAWL_KEY}` },
    }).then(r => r.json())
    if (status.status === 'completed') {
      markdown = (status.data as Array<{ markdown?: string }>)
        .map(p => p.markdown ?? '').filter(Boolean).join('\n\n---\n\n')
      break
    }
    if (status.status === 'failed') throw new Error(`Firecrawl crawl failed: ${status.error ?? 'unknown'}`)
  }
  if (!markdown) throw new Error('Firecrawl crawl timed out or returned no content')
  return markdown
}

// Synchronous single-page scrape (no polling loop needed)
async function tryFirecrawlSingle(url: string): Promise<string> {
  const scrapeRes = await fetch('https://api.firecrawl.dev/v1/scrape', {
    method: 'POST',
    headers: { Authorization: `Bearer ${FIRECRAWL_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, formats: ['markdown'], onlyMainContent: false }),
  })
  const scrapeData = await scrapeRes.json()
  if (!scrapeData.success) throw new Error(scrapeData.error ?? 'Firecrawl scrape failed')
  const markdown: string = scrapeData.data?.markdown ?? ''
  if (!markdown) throw new Error('Firecrawl scrape returned no content')
  return markdown
}

export async function crawlToMarkdown(
  url: string,
  forceProvider?: 'apify' | 'firecrawl',
  options?: { singlePage?: boolean },
): Promise<{ markdown: string; provider: 'apify' | 'firecrawl' }> {
  const singlePage = options?.singlePage ?? false

  if (forceProvider === 'apify' || (!forceProvider && APIFY_KEY)) {
    try {
      console.log('[crawl] provider=apify')
      const markdown = await tryApify(url, singlePage)
      return { markdown, provider: 'apify' }
    } catch (err) {
      if (err instanceof ApifyUnavailableError) {
        console.warn(`[crawl] Apify unavailable — falling back to Firecrawl. ${(err as Error).message}`)
        if (forceProvider === 'apify') throw err
      } else {
        throw err  // non-credit errors fail the venue scrape
      }
    }
  }
  console.log(`[crawl] provider=firecrawl singlePage=${singlePage}`)
  const markdown = singlePage ? await tryFirecrawlSingle(url) : await tryFirecrawl(url)
  return { markdown, provider: 'firecrawl' }
}
