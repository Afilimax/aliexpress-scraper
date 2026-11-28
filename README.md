<a href="https://afilimax.net"><img src="https://raw.githubusercontent.com/Afilimax/.github/main/assets/npm-banner.svg" alt="Afilimax — Encontre a oferta. Gere o link. Divulgue sozinho." width="100%" /></a>

[![npm version](https://img.shields.io/npm/v/%40afilimax%2Faliexpress-scraper?logo=npm)](https://www.npmjs.com/package/@afilimax/aliexpress-scraper)
[![npm downloads](https://img.shields.io/npm/dm/%40afilimax%2Faliexpress-scraper?logo=npm)](https://www.npmjs.com/package/@afilimax/aliexpress-scraper)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/Afilimax/aliexpress-scraper/blob/HEAD/LICENSE)
[![Website](https://img.shields.io/badge/website-afilimax.net-7857FF)](https://afilimax.net)

# @afilimax/aliexpress-scraper

Biblioteca TypeScript para pesquisar produtos e extrair páginas do AliExpress Brasil. O pacote usa requisições HTTP com Impit como caminho principal e Puppeteer com modo stealth como alternativa quando a página exige renderização ou apresenta bloqueios.

## Recursos

- Busca paginada no catálogo em português do AliExpress.
- Extração de detalhes de um produto a partir da URL.
- Requisições HTTP com emulação de Chrome e localização brasileira.
- Fallback automático para navegador com Puppeteer Stealth.
- Leitura de dados de `_init_data_`, `runParams`, JSON-LD e metadados HTML.
- Preços normalizados em BRL e resultados tipados pelo `@afilimax/core`.
- Encerramento explícito do navegador usado pelo fallback.

## Instalação

```bash
npm install @afilimax/aliexpress-scraper @afilimax/core
```

O `@afilimax/core` é uma dependência de par obrigatória, na versão `^0.5.0`.

## Como usar

### Pesquisar produtos

```typescript
import { AliExpressScraper } from "@afilimax/aliexpress-scraper"

async function main() {
    const scraper = new AliExpressScraper({ quiet: false })

    try {
        const products = await scraper.searchProducts({
            query: "wireless gaming headset",
            limit: 5,
            page: 1,
        })

        console.log("Products found:", products.length)
        console.log(JSON.stringify(products, null, 2))
    } catch (error) {
        console.error("Search failed:", error)
    } finally {
        await scraper.close()
    }
}

main()
```

### Extrair um produto

```typescript
const product = await scraper.getProduct({
    url: "https://pt.aliexpress.com/item/1005009120888793.html",
})

console.log("Product title:", product.title)
console.log("Current price:", product.price.value)
```

Chame `close()` ao terminar para liberar o navegador caso o fallback tenha sido acionado.

## Configuração

O construtor aceita `AliExpressScraperOptions`:

| Opção | Tipo | Padrão | Descrição |
| :--- | :--- | :--- | :--- |
| `timeout` | `number` | `30000` | Tempo limite das requisições e navegações, em milissegundos. |
| `quiet` | `boolean` | `true` | Quando `false`, exibe logs de diagnóstico no console. |

O caminho HTTP utiliza `pt.aliexpress.com`, cookies de região brasileira e preços em BRL. O fallback procura uma instalação local do Chrome nos caminhos usuais do Windows; sem ela, usa a resolução padrão do Puppeteer.

## Referência da API

### Métodos

#### `searchProducts(options): Promise<ScrapedProductPreview[]>`

Pesquisa produtos e retorna uma lista resumida. Se o caminho HTTP não produzir resultados, o scraper tenta o navegador. Falhas no fallback resultam em uma lista vazia.

| Opção | Tipo | Padrão | Descrição |
| :--- | :--- | :--- | :--- |
| `query` | `string` | Obrigatório | Termo de pesquisa. |
| `limit` | `number` | `20` | Quantidade máxima de itens retornados. |
| `page` | `number` | `1` | Página da pesquisa. |

#### `getProduct(options): Promise<ScrapedProduct>`

Extrai os dados completos disponíveis em uma página de produto.

| Opção | Tipo | Descrição |
| :--- | :--- | :--- |
| `url` | `string` | URL da página do produto no AliExpress. |

#### `close(): Promise<void>`

Fecha a instância do navegador, quando aberta, e limpa a referência interna.

### Estrutura do retorno

`getProduct` retorna o contrato `ScrapedProduct`. Exemplo da estrutura produzida:

```typescript
const product = {
    marketplace: "aliexpress",
    externalId: "1005009120888793",
    title: "Wireless Gaming Headset",
    description: "Wireless headset with microphone",
    brand: "Example Store",
    price: {
        value: 113.99,
        originalValue: 229.98,
        currency: "BRL",
        pixPrice: null,
        installment: null,
    },
    shipping: {
        price: 0,
        currency: "BRL",
        freeShipping: true,
        full: null,
        prime: null,
        estimatedTime: null,
    },
    rating: {
        average: 4.9,
        totalReviews: 850,
    },
    availability: {
        inStock: true,
        quantity: null,
    },
    images: ["https://ae-pic-a1.aliexpress-media.com/kf/example.jpg"],
    thumbnails: ["https://ae-pic-a1.aliexpress-media.com/kf/example.jpg"],
    categories: null,
    features: null,
    specifications: null,
    coupons: null,
    scrapedAt: "2026-10-17T21:34:16.832Z",
}
```

Campos sem dados na página recebem `null` ou valores vazios conforme o contrato. A busca retorna `ScrapedProductPreview[]`, com `marketplace`, `externalId`, `title`, `url`, `thumbnail`, `price`, `rating`, `brand` e `scrapedAt`.

## Desenvolvimento

Instale as dependências com `npm install`. Os scripts disponíveis são:

| Comando | Finalidade |
| :--- | :--- |
| `npm run dev` | Executa `src/index.ts` com `tsx`. |
| `npm run build` | Compila o TypeScript para `dist/`. |
| `npm test` | Executa os testes com Vitest. |
| `npm run test:watch` | Executa os testes em modo de observação. |
| `npm run test:cov` | Executa os testes com cobertura. |
| `npm run lint` | Executa o ESLint com correção automática. |
| `npm run format` | Formata os arquivos de `src/` com Prettier. |

## Licença

Distribuído sob a licença [MIT](./LICENSE).

---

## Automatize sua operação de afiliados

> Use este pacote para automatizar sua operação de afiliados. Conheça a plataforma Afilimax e transforme ofertas em links e divulgação automática.

[Conheça a Afilimax](https://afilimax.net) · [Pacote no npm](https://www.npmjs.com/package/@afilimax/aliexpress-scraper) · [Repositório no GitHub](https://github.com/Afilimax/aliexpress-scraper)
