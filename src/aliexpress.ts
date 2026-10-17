import fs from "node:fs"

import { Marketplace, ScrapedProduct, ScrapedProductPreview } from "@afilimax/core"
import { Impit } from "impit"
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

export type AliExpressGetProductOptions = {
    url: string
}

export class AliExpressScraper {
    private readonly timeout: number
    private readonly quiet: boolean
    private httpClient: Impit
    private browser: any = null

    constructor(options: AliExpressScraperOptions = {}) {
        this.timeout = options.timeout ?? 30000
        this.quiet = options.quiet ?? true

        this.httpClient = new Impit({
            browser: "chrome",
            timeout: this.timeout,
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
            // Estratégia 1: Leve e ultrarrápida via Impit (emulação Chrome)
            const response = await this.httpClient.fetch(url)
            if (response.status === 200) {
                const html = await response.text()
                if (html) {
                    const results = this.extractFromHtml(html, limit, scrapedAt)
                    if (results.length > 0) {
                        this.log(`Estratégia HTTP (Impit) obteve ${results.length} produtos`)
                        return results
                    }
                }
            }
        } catch (error: any) {
            this.log(`Estratégia HTTP (Impit) falhou (${error.message}). Tentando fallback via Browser...`)
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

    async getProduct({ url }: AliExpressGetProductOptions): Promise<ScrapedProduct> {
        this.log(`Obtendo produto do AliExpress: ${url}`)
        let html = ""

        try {
            const response = await this.httpClient.fetch(url)
            if (response.status === 200) {
                html = await response.text()
                this.log(`HTML obtido via Impit (${html.length} bytes)`)
            }
        } catch (error: any) {
            this.log(`Fetch HTTP falhou: ${error.message}. Tentando navegador...`)
        }

        const isBlocked = !html || html.length < 5000 || html.includes("login.aliexpress.com") || html.includes("sec.aliexpress.com")

        if (isBlocked) {
            this.log("Acionando fallback do Puppeteer Stealth para carregar produto...")
            html = await this.fetchProductPageViaBrowser(url)
        }

        return this.parseProductPage(html, url)
    }

    private async fetchProductPageViaBrowser(url: string): Promise<string> {
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
            await new Promise((r) => setTimeout(r, 2000))

            return await page.content()
        } finally {
            await page.close()
        }
    }

    private parseProductPage(html: string, url: string): ScrapedProduct {
        const scrapedAt = new Date().toISOString()

        const idMatch = url.match(/\/item\/(\d+)\.html/i)
        const externalId = idMatch ? idMatch[1] : null

        // 1. Tentar parsear runParams ou _init_data_
        let runParamsData: any = null
        const runParamsMatch = html.match(/window\.runParams\s*=\s*(\{[\s\S]*?\});\s*(?:var|window|console|<\/script)/i)
        if (runParamsMatch) {
            try {
                const evalFn = new Function(`return ${runParamsMatch[1]}`)
                runParamsData = evalFn()?.data
            } catch {
                // continua
            }
        }

        // 2. Tentar JSON-LD
        let jsonLdProduct: any = null
        const jsonLdMatches = [...html.matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)]
        for (const match of jsonLdMatches) {
            try {
                const parsed = JSON.parse(match[1])
                if (parsed["@type"] === "Product") {
                    jsonLdProduct = parsed
                    break
                }
            } catch {
                continue
            }
        }

        // Title
        let title =
            runParamsData?.pageModule?.title ??
            runParamsData?.titleModule?.subject ??
            jsonLdProduct?.name ??
            null

        if (!title) {
            const ogTitleMatch = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]*)"/i)
            if (ogTitleMatch) title = ogTitleMatch[1]
        }
        if (!title) {
            const titleTagMatch = html.match(/<title>([^<]*)<\/title>/i)
            if (titleTagMatch) title = titleTagMatch[1]
        }

        // Description
        let description =
            runParamsData?.descriptionModule?.description ??
            jsonLdProduct?.description ??
            null
        if (!description) {
            const ogDescMatch = html.match(/<meta[^>]+property="og:description"[^>]+content="([^"]*)"/i)
            if (ogDescMatch) description = ogDescMatch[1]
        }

        // Brand / Store
        let brand =
            runParamsData?.storeModule?.storeName ??
            runParamsData?.sellerModule?.storeName ??
            jsonLdProduct?.brand?.name ??
            null
        if (!brand) {
            const ogSiteMatch = html.match(/<meta[^>]+property="og:site_name"[^>]+content="([^"]*)"/i)
            if (ogSiteMatch) brand = ogSiteMatch[1]
        }

        // Price
        let priceValue: number | null = null
        let originalPriceValue: number | null = null

        const actPriceRaw =
            runParamsData?.priceModule?.formatedActivityPrice ??
            runParamsData?.priceModule?.minActivityAmount?.value ??
            runParamsData?.priceModule?.formatedAmount ??
            runParamsData?.priceModule?.minAmount?.value ??
            jsonLdProduct?.offers?.price ??
            jsonLdProduct?.offers?.lowPrice

        priceValue = this.parsePrice(actPriceRaw)

        const origPriceRaw =
            runParamsData?.priceModule?.formatedPrice ??
            runParamsData?.priceModule?.maxAmount?.value

        originalPriceValue = this.parsePrice(origPriceRaw)
        if (originalPriceValue !== null && priceValue !== null && originalPriceValue <= priceValue) {
            originalPriceValue = null
        }

        // Fallback regex para preço no HTML se ainda null
        if (priceValue == null) {
            const actMatch = html.match(/"formatedActivityPrice":"R\$\s*([\d,.]+)"/i)
            if (actMatch) priceValue = this.parsePrice(actMatch[1])
        }
        if (priceValue == null) {
            const formatedMatch = html.match(/"formatedAmount":"R\$\s*([\d,.]+)"/i)
            if (formatedMatch) priceValue = this.parsePrice(formatedMatch[1])
        }

        // Rating
        let ratingAverage = 0
        let totalReviews: number | null = null

        const avgStar =
            runParamsData?.titleModule?.feedbackRating?.averageStar ??
            runParamsData?.feedbackModule?.averageStar ??
            jsonLdProduct?.aggregateRating?.ratingValue
        if (avgStar != null) {
            ratingAverage = this.parsePrice(avgStar) ?? 0
        } else {
            const starMatch = html.match(/"averageStar":([\d.]+)/i)
            if (starMatch) ratingAverage = parseFloat(starMatch[1])
        }

        const validNum =
            runParamsData?.titleModule?.feedbackRating?.totalValidNum ??
            runParamsData?.feedbackModule?.totalValidNum ??
            jsonLdProduct?.aggregateRating?.reviewCount ??
            jsonLdProduct?.aggregateRating?.ratingCount
        if (validNum != null) {
            totalReviews = parseInt(String(validNum), 10)
        } else {
            const numMatch = html.match(/"totalValidNum":(\d+)/i)
            if (numMatch) totalReviews = parseInt(numMatch[1], 10)
        }

        // Images
        const images: string[] = []
        const rawImages =
            runParamsData?.imageModule?.imagePathList ??
            (Array.isArray(jsonLdProduct?.image) ? jsonLdProduct.image : jsonLdProduct?.image ? [jsonLdProduct.image] : [])

        for (const img of rawImages) {
            const formatted = this.formatThumbnail(img)
            if (formatted && !images.includes(formatted)) {
                images.push(formatted)
            }
        }

        if (images.length === 0) {
            const ogImgMatch = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]*)"/i)
            if (ogImgMatch) {
                const formatted = this.formatThumbnail(ogImgMatch[1])
                if (formatted) images.push(formatted)
            }
        }

        // Shipping
        const freeShipping = /frete grátis|free shipping/i.test(html)

        // Availability
        const inStock = !html.includes('"quantity":0') && !/produto esgotado|out of stock/i.test(html)

        return {
            marketplace: Marketplace.AliExpress,
            externalId,
            title: title ? title.trim() : "Produto AliExpress",
            description: description ? description.trim() : null,
            brand: brand ? brand.trim() : null,
            price: {
                value: priceValue ?? 0,
                originalValue: originalPriceValue,
                currency: "BRL",
                pixPrice: null,
                installment: null,
            },
            shipping: {
                price: freeShipping ? 0 : null,
                currency: "BRL",
                freeShipping,
                full: null,
                prime: null,
                estimatedTime: null,
            },
            rating: {
                average: ratingAverage,
                totalReviews,
            },
            availability: {
                inStock,
                quantity: null,
            },
            images,
            thumbnails: images.length > 0 ? images : null,
            categories: null,
            features: null,
            specifications: null,
            coupons: null,
            scrapedAt,
        }
    }

    async close(): Promise<void> {
        if (this.browser) {
            await this.browser.close()
            this.browser = null
        }
    }
}
