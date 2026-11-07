import fs from "node:fs"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { AliExpressScraper } from "../src/index"

const puppeteerMock = vi.hoisted(() => ({ launch: vi.fn(), use: vi.fn() }))

vi.mock("puppeteer-extra", () => ({ default: puppeteerMock }))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const initDataHtml = (items: unknown[]) =>
    `<script>/*!-->init-data-start--*/\nwindow._dida_config_._init_data_= ${JSON.stringify({
        data: { data: { root: { fields: { mods: { itemList: { content: items } } } } } },
    })}\n/*!-->init-data-end--*/</script>`

type PageParts = { run?: unknown; ld?: unknown; body?: string }

const productHtml = ({ run, ld, body = "" }: PageParts = {}) =>
    `<html><head>${
        ld === undefined
            ? ""
            : `<script type="application/ld+json">${JSON.stringify({ "@type": "Product", ...(ld as object) })}</script>`
    }${run === undefined ? "" : `<script>window.runParams = ${JSON.stringify({ data: run })};\nvar x = 1;</script>`}${body}</head></html>`

const URL = "https://pt.aliexpress.com/item/1005009120888793.html"

const makeScraper = (options = {}) => new AliExpressScraper({ quiet: true, ...options })

const parse = (html: string, url = URL) => (makeScraper() as any).parseProductPage(html, url)
const extract = (html: string, limit = 20) => (makeScraper() as any).extractFromHtml(html, limit, "now")

function makePage(content = "<html></html>") {
    return {
        setViewport: vi.fn(),
        setUserAgent: vi.fn(),
        setExtraHTTPHeaders: vi.fn(),
        goto: vi.fn(),
        content: vi.fn().mockResolvedValue(content),
        close: vi.fn(),
    }
}

function makeBrowser(page = makePage()) {
    return { newPage: vi.fn().mockResolvedValue(page), close: vi.fn() }
}

beforeEach(() => {
    vi.restoreAllMocks()
    puppeteerMock.launch.mockReset()
})

afterEach(() => {
    vi.useRealTimers()
})

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

describe("constructor and log", () => {
    it("uses defaults (quiet logging) when no options are given", () => {
        const spy = vi.spyOn(console, "log").mockImplementation(() => {})
        const scraper = new AliExpressScraper() as any

        scraper.log("hidden")

        expect(spy).not.toHaveBeenCalled()
        expect(scraper.timeout).toBe(30000)
    })

    it("logs when quiet is false", () => {
        const spy = vi.spyOn(console, "log").mockImplementation(() => {})
        const scraper = new AliExpressScraper({ quiet: false, timeout: 10 }) as any

        scraper.log("visible")

        expect(spy).toHaveBeenCalledWith("[AliExpressScraper] visible")
        expect(scraper.timeout).toBe(10)
    })
})

describe("getSearchUrl", () => {
    const scraper = makeScraper() as any

    it("slugifies the query and omits the page for page 1", () => {
        expect(scraper.getSearchUrl("  Smart  Watch ")).toBe("https://pt.aliexpress.com/w/wholesale-smart-watch.html")
    })

    it("adds the page parameter after page 1", () => {
        expect(scraper.getSearchUrl("fone", 3)).toBe("https://pt.aliexpress.com/w/wholesale-fone.html?page=3")
    })
})

describe("parsePrice", () => {
    const scraper = makeScraper() as any

    it.each([
        [null, null],
        [undefined, null],
        [NaN, null],
        [12.5, 12.5],
        ["R$ 12,50", 12.5],
        ["abc", null],
    ])("parsePrice(%s) -> %s", (input, expected) => {
        expect(scraper.parsePrice(input)).toBe(expected)
    })
})

describe("formatProductUrl / formatThumbnail", () => {
    const scraper = makeScraper() as any

    it("builds the product url from the id, a protocol-relative url, an absolute url or nothing", () => {
        expect(scraper.formatProductUrl("123", "x")).toBe("https://pt.aliexpress.com/item/123.html")
        expect(scraper.formatProductUrl(null, "//a.com/p")).toBe("https://a.com/p")
        expect(scraper.formatProductUrl(null, "https://a.com/p")).toBe("https://a.com/p")
        expect(scraper.formatProductUrl(null, null)).toBe("")
        expect(scraper.formatProductUrl(null)).toBe("")
    })

    it("normalizes thumbnails", () => {
        expect(scraper.formatThumbnail(null)).toBeNull()
        expect(scraper.formatThumbnail(undefined)).toBeNull()
        expect(scraper.formatThumbnail("//a.com/i.jpg")).toBe("https://a.com/i.jpg")
        expect(scraper.formatThumbnail("https://a.com/i.jpg")).toBe("https://a.com/i.jpg")
    })
})

// ---------------------------------------------------------------------------
// extractFromHtml
// ---------------------------------------------------------------------------

describe("extractFromHtml", () => {
    const base = { productId: 1, title: { displayTitle: "  Produto  " } }

    it("returns an empty list when there is no data at all", () => {
        expect(extract("<html></html>")).toEqual([])
    })

    it("respects the limit", () => {
        const html = initDataHtml([base, { ...base, productId: 2 }, { ...base, productId: 3 }])

        expect(extract(html, 2)).toHaveLength(2)
    })

    it("skips items without a title and accepts title.title", () => {
        const html = initDataHtml([{ productId: 1 }, { productId: 2, title: { title: "Alternativo" } }])

        const items = extract(html)

        expect(items).toHaveLength(1)
        expect(items[0].title).toBe("Alternativo")
    })

    it("uses the raw url when there is no product id", () => {
        const [item] = extract(
            initDataHtml([
                { title: { displayTitle: "X" }, productDetailUrl: "//a.com/p", image: { imgUrl: "//a.com/i" } },
            ]),
        )

        expect(item).toMatchObject({ externalId: null, url: "https://a.com/p", thumbnail: "https://a.com/i" })
    })

    it.each([
        ["minPrice", { prices: { salePrice: { minPrice: 10 }, originalPrice: { minPrice: 20 } } }, 10, 20],
        ["cent", { prices: { salePrice: { cent: 1050 }, originalPrice: { cent: 2000 } } }, 10.5, 20],
        ["missing", { prices: { salePrice: {}, originalPrice: {} } }, null, null],
        ["no prices", {}, null, null],
    ])("extracts prices from %s", (_name, extra, price, original) => {
        const [item] = extract(initDataHtml([{ ...base, ...extra }]))

        expect(item.price).toEqual({ value: price, originalValue: original, currency: "BRL" })
    })

    it.each([
        ["numeric rating", { evaluation: { starRating: 4.5, totalReviews: 10 } }, { average: 4.5, totalReviews: 10 }],
        ["string rating", { evaluation: { starRating: "4.2", totalReviews: "7" } }, { average: 4.2, totalReviews: 7 }],
        ["no total reviews", { evaluation: { starRating: 4 } }, { average: 4, totalReviews: null }],
        [
            "invalid total reviews",
            { evaluation: { starRating: 4, totalReviews: "x" } },
            { average: 4, totalReviews: null },
        ],
        ["zero rating", { evaluation: { starRating: 0 } }, null],
        ["no rating", {}, null],
    ])("extracts the rating from %s", (_name, extra, expected) => {
        const [item] = extract(initDataHtml([{ ...base, ...extra }]))

        expect(item.rating).toEqual(expected)
    })

    it.each([
        ["store_name", { trace: { custom: { store_name: "A", company_name: "B" } }, store: { storeName: "C" } }, "A"],
        ["company_name", { trace: { custom: { company_name: "B" } }, store: { storeName: "C" } }, "B"],
        ["storeName", { store: { storeName: "C" } }, "C"],
        ["none", {}, null],
    ])("extracts the brand from %s", (_name, extra, expected) => {
        const [item] = extract(initDataHtml([{ ...base, ...extra }]))

        expect(item.brand).toBe(expected)
    })

    it("logs the number of products found", () => {
        const spy = vi.spyOn(console, "log").mockImplementation(() => {})
        const scraper = new AliExpressScraper({ quiet: false }) as any

        scraper.extractFromHtml(initDataHtml([base]), 20, "now")

        expect(spy).toHaveBeenCalledWith("[AliExpressScraper] Produtos encontrados em itemList: 1")
    })

    it("falls back to the regex when the markers have no assignment", () => {
        const html = `/*!-->init-data-start--*/ nothing here /*!-->init-data-end--*/ ${initDataRegexHtml([base])}`

        expect(extract(html)).toHaveLength(1)
    })

    it("logs and falls back when the init data cannot be evaluated", () => {
        const spy = vi.spyOn(console, "log").mockImplementation(() => {})
        const scraper = new AliExpressScraper({ quiet: false }) as any
        const html = "/*!-->init-data-start--*/ window.x = {{{ /*!-->init-data-end--*/"

        expect(scraper.extractFromHtml(html, 20, "now")).toEqual([])
        expect(spy).toHaveBeenCalledWith(expect.stringContaining("Erro ao avaliar init_data"))
    })

    it("uses the regex fallback when the markers are missing", () => {
        expect(extract(initDataRegexHtml([base]))).toHaveLength(1)
    })

    it("ignores an invalid object found by the regex fallback", () => {
        expect(extract("window._dida_config_._init_data_ = {{{};</script>")).toEqual([])
    })
})

function initDataRegexHtml(items: unknown[]) {
    return `<script>window._dida_config_._init_data_ = ${JSON.stringify({
        data: { data: { root: { fields: { mods: { itemList: { content: items } } } } } },
    })};</script>`
}

// ---------------------------------------------------------------------------
// Browser handling
// ---------------------------------------------------------------------------

describe("getBrowser", () => {
    it("launches with the first installed chrome and caches the browser", async () => {
        const browser = makeBrowser()
        puppeteerMock.launch.mockResolvedValue(browser)
        vi.spyOn(fs, "existsSync").mockReturnValue(true)
        const scraper = makeScraper() as any

        expect(await scraper.getBrowser()).toBe(browser)
        expect(await scraper.getBrowser()).toBe(browser)

        expect(puppeteerMock.launch).toHaveBeenCalledTimes(1)
        expect(puppeteerMock.launch.mock.calls[0][0].executablePath).toContain("Program Files\\Google")
    })

    it("falls back to the x86 chrome path", async () => {
        puppeteerMock.launch.mockResolvedValue(makeBrowser())
        vi.spyOn(fs, "existsSync").mockImplementation((p) => String(p).includes("(x86)"))

        await (makeScraper() as any).getBrowser()

        expect(puppeteerMock.launch.mock.calls[0][0].executablePath).toContain("(x86)")
    })

    it("launches without an executable path when chrome is not found", async () => {
        puppeteerMock.launch.mockResolvedValue(makeBrowser())
        vi.spyOn(fs, "existsSync").mockReturnValue(false)

        await (makeScraper() as any).getBrowser()

        expect(puppeteerMock.launch.mock.calls[0][0]).not.toHaveProperty("executablePath")
    })
})

describe("close", () => {
    it("does nothing without a browser", async () => {
        await expect(makeScraper().close()).resolves.toBeUndefined()
    })

    it("closes and clears the browser", async () => {
        const browser = makeBrowser()
        puppeteerMock.launch.mockResolvedValue(browser)
        const scraper = makeScraper() as any
        await scraper.getBrowser()

        await scraper.close()

        expect(browser.close).toHaveBeenCalled()
        expect(scraper.browser).toBeNull()
    })
})

describe("browser page helpers", () => {
    it("searchViaBrowser extracts the products from the rendered page", async () => {
        vi.useFakeTimers()
        const page = makePage(initDataHtml([{ productId: 1, title: { displayTitle: "Produto" } }]))
        puppeteerMock.launch.mockResolvedValue(makeBrowser(page))
        const scraper = makeScraper() as any

        const promise = scraper.searchViaBrowser("https://x", 5, "now")
        await vi.advanceTimersByTimeAsync(2000)

        await expect(promise).resolves.toHaveLength(1)
        expect(page.goto).toHaveBeenCalledWith("https://x", { waitUntil: "networkidle2", timeout: 30000 })
        expect(page.close).toHaveBeenCalled()
    })

    it("searchViaBrowser closes the page when navigation fails", async () => {
        const page = makePage()
        page.goto.mockRejectedValue(new Error("boom"))
        puppeteerMock.launch.mockResolvedValue(makeBrowser(page))

        await expect((makeScraper() as any).searchViaBrowser("https://x", 5, "now")).rejects.toThrow("boom")
        expect(page.close).toHaveBeenCalled()
    })

    it("fetchProductPageViaBrowser returns the rendered html", async () => {
        vi.useFakeTimers()
        const page = makePage("<html>rendered</html>")
        puppeteerMock.launch.mockResolvedValue(makeBrowser(page))
        const scraper = makeScraper() as any

        const promise = scraper.fetchProductPageViaBrowser("https://x")
        await vi.advanceTimersByTimeAsync(2000)

        await expect(promise).resolves.toBe("<html>rendered</html>")
        expect(page.close).toHaveBeenCalled()
    })

    it("fetchProductPageViaBrowser closes the page when navigation fails", async () => {
        const page = makePage()
        page.goto.mockRejectedValue(new Error("boom"))
        puppeteerMock.launch.mockResolvedValue(makeBrowser(page))

        await expect((makeScraper() as any).fetchProductPageViaBrowser("https://x")).rejects.toThrow("boom")
        expect(page.close).toHaveBeenCalled()
    })
})

// ---------------------------------------------------------------------------
// searchProducts
// ---------------------------------------------------------------------------

describe("searchProducts", () => {
    const okHtml = initDataHtml([{ productId: 1, title: { displayTitle: "Produto" } }])
    const fallbackItem = { title: "Browser" }

    function setup(fetchImpl: () => unknown) {
        const scraper = makeScraper() as any
        vi.spyOn(scraper.httpClient, "fetch").mockImplementation(fetchImpl as any)
        const browserSpy = vi.spyOn(scraper, "searchViaBrowser").mockResolvedValue([fallbackItem])
        return { scraper: scraper as AliExpressScraper, browserSpy }
    }

    it("returns the http results and logs the strategy", async () => {
        const spy = vi.spyOn(console, "log").mockImplementation(() => {})
        const { scraper, browserSpy } = setup(async () => ({ status: 200, text: async () => okHtml }))
        ;(scraper as any).quiet = false

        const results = await scraper.searchProducts({ query: "fone" })

        expect(results).toHaveLength(1)
        expect(browserSpy).not.toHaveBeenCalled()
        expect(spy).toHaveBeenCalledWith(expect.stringContaining("Estratégia HTTP (Impit) obteve 1 produtos"))
    })

    it.each([
        ["a non-200 status", async () => ({ status: 403, text: async () => okHtml })],
        ["an empty body", async () => ({ status: 200, text: async () => "" })],
        ["a page without products", async () => ({ status: 200, text: async () => "<html></html>" })],
    ])("falls back to the browser on %s", async (_name, fetchImpl) => {
        const { scraper, browserSpy } = setup(fetchImpl)

        await expect(scraper.searchProducts({ query: "fone" })).resolves.toEqual([fallbackItem])
        expect(browserSpy).toHaveBeenCalled()
    })

    it("falls back to the browser when the request throws", async () => {
        const { scraper, browserSpy } = setup(async () => {
            throw new Error("net")
        })

        await expect(scraper.searchProducts({ query: "fone", limit: 3, page: 2 })).resolves.toEqual([fallbackItem])
        expect(browserSpy).toHaveBeenCalledWith(expect.stringContaining("?page=2"), 3, expect.any(String))
    })

    it("returns an empty list when the browser fallback fails too", async () => {
        const { scraper, browserSpy } = setup(async () => {
            throw new Error("net")
        })
        browserSpy.mockRejectedValue(new Error("browser"))

        await expect(scraper.searchProducts({ query: "fone" })).resolves.toEqual([])
    })
})

// ---------------------------------------------------------------------------
// getProduct
// ---------------------------------------------------------------------------

describe("getProduct", () => {
    const longHtml = productHtml({ run: { pageModule: { title: "Do HTTP" } }, body: `<!--${"x".repeat(6000)}-->` })

    function setup(fetchImpl: () => unknown) {
        const scraper = makeScraper() as any
        vi.spyOn(scraper.httpClient, "fetch").mockImplementation(fetchImpl as any)
        const browserSpy = vi
            .spyOn(scraper, "fetchProductPageViaBrowser")
            .mockResolvedValue(productHtml({ run: { pageModule: { title: "Do Browser" } } }))
        return { scraper: scraper as AliExpressScraper, browserSpy }
    }

    it("uses the http html when it is valid", async () => {
        const spy = vi.spyOn(console, "log").mockImplementation(() => {})
        const { scraper, browserSpy } = setup(async () => ({ status: 200, text: async () => longHtml }))
        ;(scraper as any).quiet = false

        const product = await scraper.getProduct({ url: URL })

        expect(product.title).toBe("Do HTTP")
        expect(browserSpy).not.toHaveBeenCalled()
        expect(spy).toHaveBeenCalledWith(expect.stringContaining("HTML obtido via Impit"))
    })

    it.each([
        ["a non-200 status", async () => ({ status: 500, text: async () => longHtml })],
        ["a short page", async () => ({ status: 200, text: async () => "<html></html>" })],
        ["a login redirect", async () => ({ status: 200, text: async () => `${longHtml}login.aliexpress.com` })],
        ["a security page", async () => ({ status: 200, text: async () => `${longHtml}sec.aliexpress.com` })],
        [
            "a failed request",
            async () => {
                throw new Error("net")
            },
        ],
    ])("falls back to the browser on %s", async (_name, fetchImpl) => {
        const { scraper, browserSpy } = setup(fetchImpl)

        const product = await scraper.getProduct({ url: URL })

        expect(product.title).toBe("Do Browser")
        expect(browserSpy).toHaveBeenCalledWith(URL)
    })
})

// ---------------------------------------------------------------------------
// parseProductPage
// ---------------------------------------------------------------------------

describe("parseProductPage", () => {
    it("parses a complete runParams payload", () => {
        const product = parse(
            productHtml({
                run: {
                    pageModule: { title: " Titulo " },
                    descriptionModule: { description: " Desc " },
                    storeModule: { storeName: " Loja " },
                    priceModule: { formatedActivityPrice: "R$ 10,00", formatedPrice: "R$ 20,00" },
                    titleModule: { feedbackRating: { averageStar: "4.5", totalValidNum: 12 } },
                    imageModule: { imagePathList: ["//a.com/1.jpg", "//a.com/1.jpg", "", "https://a.com/2.jpg"] },
                },
                body: "Frete grátis",
            }),
        )

        expect(product).toMatchObject({
            externalId: "1005009120888793",
            title: "Titulo",
            description: "Desc",
            brand: "Loja",
            price: { value: 10, originalValue: 20, currency: "BRL" },
            rating: { average: 4.5, totalReviews: 12 },
            images: ["https://a.com/1.jpg", "https://a.com/2.jpg"],
            thumbnails: ["https://a.com/1.jpg", "https://a.com/2.jpg"],
            shipping: { price: 0, freeShipping: true },
            availability: { inStock: true },
        })
    })

    it("returns defaults for an empty page", () => {
        const product = parse("<html></html>", "https://pt.aliexpress.com/other")

        expect(product).toMatchObject({
            externalId: null,
            title: "Produto AliExpress",
            description: null,
            brand: null,
            price: { value: 0, originalValue: null },
            rating: { average: 0, totalReviews: null },
            images: [],
            thumbnails: null,
            shipping: { price: null, freeShipping: false },
            availability: { inStock: true },
        })
    })

    it.each([
        ["pageModule.title", { run: { pageModule: { title: "A" }, titleModule: { subject: "B" } } }, "A"],
        ["titleModule.subject", { run: { titleModule: { subject: "B" } }, ld: { name: "C" } }, "B"],
        ["json-ld name", { ld: { name: "C" } }, "C"],
        ["og:title", { body: '<meta property="og:title" content="D">' }, "D"],
        ["<title>", { body: "<title>E</title>" }, "E"],
    ])("resolves the title from %s", (_name, parts, expected) => {
        expect(parse(productHtml(parts)).title).toBe(expected)
    })

    it.each([
        ["descriptionModule", { run: { descriptionModule: { description: "A" } }, ld: { description: "B" } }, "A"],
        ["json-ld", { ld: { description: "B" } }, "B"],
        ["og:description", { body: '<meta property="og:description" content="C">' }, "C"],
        ["nothing", {}, null],
    ])("resolves the description from %s", (_name, parts, expected) => {
        expect(parse(productHtml(parts)).description).toBe(expected)
    })

    it.each([
        ["storeModule", { run: { storeModule: { storeName: "A" }, sellerModule: { storeName: "B" } } }, "A"],
        ["sellerModule", { run: { sellerModule: { storeName: "B" } } }, "B"],
        ["json-ld brand", { ld: { brand: { name: "C" } } }, "C"],
        ["og:site_name", { body: '<meta property="og:site_name" content="D">' }, "D"],
        ["nothing", {}, null],
    ])("resolves the brand from %s", (_name, parts, expected) => {
        expect(parse(productHtml(parts)).brand).toBe(expected)
    })

    it.each([
        ["formatedActivityPrice", { run: { priceModule: { formatedActivityPrice: "R$ 1,00" } } }, 1],
        ["minActivityAmount", { run: { priceModule: { minActivityAmount: { value: 2 } } } }, 2],
        ["formatedAmount", { run: { priceModule: { formatedAmount: "R$ 3,00" } } }, 3],
        ["minAmount", { run: { priceModule: { minAmount: { value: 4 } } } }, 4],
        ["json-ld price", { ld: { offers: { price: "5" } } }, 5],
        ["json-ld lowPrice", { ld: { offers: { lowPrice: "6" } } }, 6],
        ["regex formatedActivityPrice", { body: '"formatedActivityPrice":"R$ 7,00"' }, 7],
        ["regex formatedAmount", { body: '"formatedAmount":"R$ 8,50"' }, 8.5],
        ["nothing", {}, 0],
    ])("resolves the price from %s", (_name, parts, expected) => {
        expect(parse(productHtml(parts)).price.value).toBe(expected)
    })

    it("only applies the regex price fallbacks when the price is still missing", () => {
        const product = parse(productHtml({ body: '"formatedActivityPrice":"R$ 9,00" "formatedAmount":"R$ 1,00"' }))

        expect(product.price.value).toBe(9)
    })

    it.each([
        ["formatedPrice", { priceModule: { formatedActivityPrice: "R$ 1,00", formatedPrice: "R$ 5,00" } }, 5],
        ["maxAmount", { priceModule: { formatedActivityPrice: "R$ 1,00", maxAmount: { value: 6 } } }, 6],
        ["equal to the price", { priceModule: { formatedActivityPrice: "R$ 1,00", formatedPrice: "R$ 1,00" } }, null],
        ["missing", { priceModule: { formatedActivityPrice: "R$ 1,00" } }, null],
    ])("resolves the original price from %s", (_name, run, expected) => {
        expect(parse(productHtml({ run })).price.originalValue).toBe(expected)
    })

    it("keeps the original price when the price is unknown", () => {
        const product = parse(productHtml({ run: { priceModule: { formatedPrice: "R$ 5,00" } } }))

        expect(product.price).toMatchObject({ value: 0, originalValue: 5 })
    })

    it.each([
        [
            "titleModule",
            { run: { titleModule: { feedbackRating: { averageStar: "4" } }, feedbackModule: { averageStar: 3 } } },
            4,
        ],
        ["feedbackModule", { run: { feedbackModule: { averageStar: 3 } } }, 3],
        ["json-ld", { ld: { aggregateRating: { ratingValue: "2" } } }, 2],
        ["regex", { body: '"averageStar":4.8' }, 4.8],
        ["invalid value", { run: { feedbackModule: { averageStar: "abc" } } }, 0],
        ["nothing", {}, 0],
    ])("resolves the rating average from %s", (_name, parts, expected) => {
        expect(parse(productHtml(parts)).rating.average).toBe(expected)
    })

    it.each([
        [
            "titleModule",
            { run: { titleModule: { feedbackRating: { totalValidNum: 1 } }, feedbackModule: { totalValidNum: 2 } } },
            1,
        ],
        ["feedbackModule", { run: { feedbackModule: { totalValidNum: 2 } } }, 2],
        ["json-ld reviewCount", { ld: { aggregateRating: { reviewCount: "3" } } }, 3],
        ["json-ld ratingCount", { ld: { aggregateRating: { ratingCount: "4" } } }, 4],
        ["regex", { body: '"totalValidNum":5' }, 5],
        ["nothing", {}, null],
    ])("resolves the total reviews from %s", (_name, parts, expected) => {
        expect(parse(productHtml(parts)).rating.totalReviews).toBe(expected)
    })

    it.each([
        ["json-ld array", { ld: { image: ["//a.com/1.jpg", "//a.com/1.jpg"] } }, ["https://a.com/1.jpg"]],
        ["json-ld string", { ld: { image: "//a.com/2.jpg" } }, ["https://a.com/2.jpg"]],
        ["og:image", { body: '<meta property="og:image" content="//a.com/3.jpg">' }, ["https://a.com/3.jpg"]],
        ["empty og:image", { body: '<meta property="og:image" content="">' }, []],
        ["nothing", {}, []],
    ])("resolves the images from %s", (_name, parts, expected) => {
        expect(parse(productHtml(parts)).images).toEqual(expected)
    })

    it("reports out of stock pages", () => {
        expect(parse(productHtml({ body: '"quantity":0' })).availability.inStock).toBe(false)
        expect(parse(productHtml({ body: "Produto esgotado" })).availability.inStock).toBe(false)
    })

    it("ignores invalid runParams and invalid or non-product json-ld blocks", () => {
        const html =
            `<script>window.runParams = {{{};\nvar x = 1;</script>` +
            `<script type="application/ld+json">not json</script>` +
            `<script type="application/ld+json">{"@type":"Organization"}</script>` +
            `<script type="application/ld+json">{"@type":"Product","name":"Do JSON-LD"}</script>`

        expect(parse(html).title).toBe("Do JSON-LD")
    })
})
