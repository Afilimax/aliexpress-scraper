import { Marketplace } from "@afilimax/core"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { AliExpressScraper } from "../src/index"

const sampleHtmlWithInitData = `
<!DOCTYPE html>
<html>
<head>
<script>
/*!-->init-data-start--*/
window._dida_config_._init_data_= {
    data: {
        data: {
            root: {
                fields: {
                    mods: {
                        itemList: {
                            content: [
                                {
                                    productId: "1005009120888793",
                                    title: {
                                        displayTitle: "Fone de Ouvido Bluetooth Sem Fio Gamer L80"
                                    },
                                    productDetailUrl: "https://www.aliexpress.com/item/1005009120888793.html",
                                    image: {
                                        imgUrl: "//ae-pic-a1.aliexpress-media.com/kf/S4e9ae2cb.jpg"
                                    },
                                    prices: {
                                        salePrice: {
                                            minPrice: 113.99,
                                            currencyCode: "BRL"
                                        },
                                        originalPrice: {
                                            minPrice: 229.98,
                                            currencyCode: "BRL"
                                        }
                                    },
                                    evaluation: {
                                        starRating: 4.9,
                                        totalReviews: 850
                                    },
                                    trace: {
                                        custom: {
                                            store_name: "Little Goldfish Digital Store"
                                        }
                                    }
                                }
                            ]
                        }
                    }
                }
            }
        }
    }
}
/*!-->init-data-end--*/
</script>
</head>
<body></body>
</html>
`

describe("AliExpressScraper – searchProducts", () => {
    let scraper: AliExpressScraper

    beforeEach(() => {
        scraper = new AliExpressScraper({ quiet: true })
        vi.restoreAllMocks()
    })

    it("deve extrair e retornar ScrapedProductPreview[] a partir do bloco init_data", async () => {
        // Mock do httpClient para simular retorno HTML do AliExpress
        vi.spyOn((scraper as any).httpClient, "fetch").mockResolvedValue({
            status: 200,
            body: sampleHtmlWithInitData,
        })

        const results = await scraper.searchProducts({ query: "fone bluetooth", limit: 5 })

        expect(Array.isArray(results)).toBe(true)
        expect(results.length).toBe(1)

        const item = results[0]
        expect(item.marketplace).toBe(Marketplace.AliExpress)
        expect(item.externalId).toBe("1005009120888793")
        expect(item.title).toBe("Fone de Ouvido Bluetooth Sem Fio Gamer L80")
        expect(item.url).toBe("https://pt.aliexpress.com/item/1005009120888793.html")
        expect(item.thumbnail).toBe("https://ae-pic-a1.aliexpress-media.com/kf/S4e9ae2cb.jpg")
        expect(item.price.value).toBe(113.99)
        expect(item.price.originalValue).toBe(229.98)
        expect(item.price.currency).toBe("BRL")
        expect(item.rating).toEqual({
            average: 4.9,
            totalReviews: 850,
        })
        expect(item.brand).toBe("Little Goldfish Digital Store")
        expect(typeof item.scrapedAt).toBe("string")
    })

    it("deve construir a URL brasileira correta com paginação", async () => {
        const fetchSpy = vi.spyOn((scraper as any).httpClient, "fetch").mockResolvedValue({
            status: 200,
            body: sampleHtmlWithInitData,
        })

        await scraper.searchProducts({ query: "smart watch", page: 2 })

        expect(fetchSpy).toHaveBeenCalledWith({
            url: "https://pt.aliexpress.com/w/wholesale-smart-watch.html?page=2",
        })
    })

    it("deve acionar o fallback do navegador caso a requisição HTTP falhe", async () => {
        vi.spyOn((scraper as any).httpClient, "fetch").mockRejectedValue(new Error("Network Error"))

        const browserFallbackSpy = vi.spyOn(scraper as any, "searchViaBrowser").mockResolvedValue([
            {
                marketplace: Marketplace.AliExpress,
                externalId: "1005009999",
                title: "Produto Browser Fallback",
                url: "https://pt.aliexpress.com/item/1005009999.html",
                thumbnail: null,
                price: { value: 50, originalValue: null, currency: "BRL" },
                rating: null,
                brand: null,
                scrapedAt: new Date().toISOString(),
            },
        ])

        const results = await scraper.searchProducts({ query: "teste" })

        expect(browserFallbackSpy).toHaveBeenCalled()
        expect(results.length).toBe(1)
        expect(results[0].title).toBe("Produto Browser Fallback")
    })
})
