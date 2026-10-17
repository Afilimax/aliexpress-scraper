import fs from "node:fs"

import { Marketplace, ScrapedProductPreview } from "@afilimax/core"
import { GotScrapingClient } from "@xcrap/got-scraping-client"
import puppeteer from "puppeteer-extra"
import StealthPlugin from "puppeteer-extra-plugin-stealth"

puppeteer.use(StealthPlugin())

export type AliExpressScraperOptions = {
    timeout?: number
    quiet?: boolean
}

export type AliExpressSearchProductsOptions = {
    query: string
    limit?: number
    page?: number
}

export class AliExpressScraper {
    private readonly timeout: number
    private readonly quiet: boolean
    private httpClient: GotScrapingClient
    private browser: any = null

    constructor(options: AliExpressScraperOptions = {}) {
        this.timeout = options.timeout ?? 30000
        this.quiet = options.quiet ?? true

        this.httpClient = new GotScrapingClient({
            timeout: {
                request: this.timeout,
            },
            headers: {
                "accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
                cookie: "aep_usuc_f=site=bra&c_tp=BRL&region=BR&b_locale=pt_BR;",
            },
        })
    }

    private log(message: string): void {
        if (!this.quiet) {
            console.log(`[AliExpressScraper] ${message}`)
        }
    }

    private getSearchUrl(query: string, page = 1): string {
        const slug = query.trim().toLowerCase().replace(/\s+/g, "-")
        const pageParam = page > 1 ? `?page=${page}` : ""
        return `https://pt.aliexpress.com/w/wholesale-${encodeURIComponent(slug)}.html${pageParam}`
    }

    private parsePrice(raw: string | number | undefined | null): number | null {
        if (raw == null) return null
        if (typeof raw === "number") return isNaN(raw) ? null : raw
        const cleaned = String(raw)
            .replace(/[^\d.,]/g, "")
            .replace(",", ".")
        const n = parseFloat(cleaned)
        return isNaN(n) ? null : n
    }

    private formatProductUrl(productId: string | null, rawUrl?: string | null): string {
        if (productId) {
            return `https://pt.aliexpress.com/item/${productId}.html`
        }
        if (rawUrl) {
            if (rawUrl.startsWith("//")) return `https:${rawUrl}`
            return rawUrl
        }
        return ""
    }

    private formatThumbnail(rawUrl?: string | null): string | null {
        if (!rawUrl) return null
        if (rawUrl.startsWith("//")) return `https:${rawUrl}`
        return rawUrl
    }

    private extractFromHtml(html: string, limit: number, scrapedAt: string): ScrapedProductPreview[] {
        const items: ScrapedProductPreview[] = []

        // 1. Tentar extrair do bloco window._dida_config_._init_data_
        const startMarker = "/*!-->init-data-start--*/"
        const endMarker = "/*!-->init-data-end--*/"

        let initDataObj: any = null
        const startIdx = html.indexOf(startMarker)
        const endIdx = html.indexOf(endMarker)

        if (startIdx !== -1 && endIdx !== -1) {
            const raw = html.slice(startIdx + startMarker.length, endIdx).trim()
            const eqIdx = raw.indexOf("=")
            if (eqIdx !== -1) {
                const code = raw.slice(eqIdx + 1).trim()
                try {
                    const evalFn = new Function(`return ${code}`)
                    initDataObj = evalFn()
                } catch (e: any) {
                    this.log(`Erro ao avaliar init_data: ${e.message}`)
                }
            }
        }

        // Fallback regex se os marcadores mudarem
        if (!initDataObj) {
            const match = html.match(/window\._dida_config_\._init_data_\s*=\s*(\{[\s\S]*?\});?\s*(?:<\/?script|\/\*)/i)
            if (match) {
                try {
                    const evalFn = new Function(`return ${match[1]}`)
                    initDataObj = evalFn()
                } catch {
                    // Ignora
                }
            }
        }

        const productList: any[] = initDataObj?.data?.data?.root?.fields?.mods?.itemList?.content ?? []
        this.log(`Produtos encontrados em itemList: ${productList.length}`)

        for (const rawItem of productList) {
            if (items.length >= limit) break

            const productId = rawItem.productId ? String(rawItem.productId) : null
            const title = rawItem.title?.displayTitle ?? rawItem.title?.title ?? ""
            if (!title) continue

            const productUrl = this.formatProductUrl(productId, rawItem.productDetailUrl)
            const thumbnail = this.formatThumbnail(rawItem.image?.imgUrl)

            // Preço
            const salePriceRaw =
                rawItem.prices?.salePrice?.minPrice ??
                (rawItem.prices?.salePrice?.cent ? rawItem.prices.salePrice.cent / 100 : null)
            const origPriceRaw =
                rawItem.prices?.originalPrice?.minPrice ??
                (rawItem.prices?.originalPrice?.cent ? rawItem.prices.originalPrice.cent / 100 : null)

            const priceValue = this.parsePrice(salePriceRaw)
            const originalValue = this.parsePrice(origPriceRaw)

            // Rating
            const starRating = rawItem.evaluation?.starRating
            const ratingAvg = typeof starRating === "number" ? starRating : parseFloat(String(starRating || ""))
            const totalReviews =
                rawItem.evaluation?.totalReviews != null ? parseInt(String(rawItem.evaluation.totalReviews), 10) : null

            // Marca / Loja
            const brand =
                rawItem.trace?.custom?.store_name ??
                rawItem.trace?.custom?.company_name ??
                rawItem.store?.storeName ??
                null

            items.push({
                marketplace: Marketplace.AliExpress,
                externalId: productId,
                title: title.trim(),
                url: productUrl,
                thumbnail,
                price: {
                    value: priceValue,
                    originalValue,
                    currency: "BRL",
                },
                rating:
                    !isNaN(ratingAvg) && ratingAvg > 0
                        ? {
                              average: ratingAvg,
                              totalReviews: isNaN(totalReviews as number) ? null : totalReviews,
                          }
                        : null,
                brand,
                scrapedAt,
            })
        }

        return items
    }

    private async getBrowser(): Promise<any> {
        if (!this.browser) {
            const chromePaths = [
                "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
                "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
            ]
            let executablePath: string | undefined
            for (const p of chromePaths) {
                if (fs.existsSync(p)) {
                    executablePath = p
                    break
                }
            }

            this.browser = await puppeteer.launch({
                headless: false,
                ...(executablePath ? { executablePath } : {}),
                args: [
                    "--no-sandbox",
                    "--disable-setuid-sandbox",
                    "--window-size=1920,1080",
                    "--window-position=-2000,-2000",
                    "--disable-blink-features=AutomationControlled",
                ],
            })
        }
        return this.browser
    }

    private async searchViaBrowser(url: string, limit: number, scrapedAt: string): Promise<ScrapedProductPreview[]> {
        const browser = await this.getBrowser()
        const page = await browser.newPage()

        try {
            await page.setViewport({ width: 1920, height: 1080 })
            await page.setUserAgent(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
            )
            await page.setExtraHTTPHeaders({
                "accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
            })

            await page.goto(url, { waitUntil: "networkidle2", timeout: this.timeout })

            // Aguarda dados renderizarem
            await new Promise((r) => setTimeout(r, 2000))
            const html = await page.content()
            return this.extractFromHtml(html, limit, scrapedAt)
        } finally {
            await page.close()
        }
    }

    async searchProducts({
        query,
        limit = 20,
        page = 1,
    }: AliExpressSearchProductsOptions): Promise<ScrapedProductPreview[]> {
        const url = this.getSearchUrl(query, page)
        const scrapedAt = new Date().toISOString()
        this.log(`Buscando produtos em: ${url}`)

        try {
            // Estratégia 1: Leve e rápida via GotScrapingClient
            const response = await this.httpClient.fetch({ url })
            if (response.status === 200 && response.body) {
                const results = this.extractFromHtml(response.body, limit, scrapedAt)
                if (results.length > 0) {
                    this.log(`Estratégia HTTP obteve ${results.length} produtos`)
                    return results
                }
            }
        } catch (error: any) {
            this.log(`Estratégia HTTP falhou (${error.message}). Tentando fallback via Browser...`)
        }

        // Estratégia 2: Fallback via Puppeteer Stealth
        try {
            this.log(`Iniciando fallback com Puppeteer Stealth...`)
            return await this.searchViaBrowser(url, limit, scrapedAt)
        } catch (browserError: any) {
            this.log(`Falha também no fallback do navegador: ${browserError.message}`)
            return []
        }
    }

    async close(): Promise<void> {
        if (this.browser) {
            await this.browser.close()
            this.browser = null
        }
    }
}
