// Shared payload and output interfaces for Trigger.dev scraping tasks

export interface ScrapeHomepagePayload {
  venueId: string
  url: string
}

export interface ScrapeHomepageOutput {
  venueId: string
  storageKey: string
  provider: 'apify' | 'firecrawl'
  byteSize: number
}

export interface AnalyzeHomepagePayload {
  venueId: string
  storageKey: string
  sourceUrl: string
}

export interface AnalyzeHomepageOutput {
  venueId: string
  eventsFound: number
  subUrls: string[]
}

export interface ScrapeSubUrlsPayload {
  venueId: string
  subUrls: string[]
}

export interface ScrapeSubUrlsOutput {
  venueId: string
  storageKey: string
  urlsScraped: number
  byteSize: number
}

export interface AnalyzeSubUrlsPayload {
  venueId: string
  storageKey: string
  subUrls: string[]
  venueUrl: string
}

export interface AnalyzeSubUrlsOutput {
  venueId: string
  eventsFound: number
}

export interface VenueScrapePipelinePayload {
  venueId: string
  websiteUrl: string
}

export interface DiscoveryPayload {
  limit?: number
  force?: boolean
}

export interface DiscoveryOutput {
  inserted: number
  skipped: number
  errors: number
}

export interface RunVenueScrapePayload {
  limit?: number
}

export interface RunVenueScrapeOutput {
  processed: number
  skipped: number
}

export const SCRAPE_FAIL_THRESHOLD = 5

export const ScrapeWorkflow = {
  SCRAPE_HOMEPAGE:  'scrape_homepage',
  SCRAPE_SUB_URLS:  'scrape_sub_urls',
  ANALYZE_HOMEPAGE: 'analyze_homepage',
  ANALYZE_SUB_URLS: 'analyze_sub_urls',
  VENUE_PIPELINE:   'venue_pipeline',
  SCHEDULED_SCRAPE: 'scheduled_scrape',
  VENUE_DISCOVERY:  'venue_discovery',
  HTML_SCRAPE:      'html_scrape',
  AI_PARSE:         'ai_parse',
} as const
