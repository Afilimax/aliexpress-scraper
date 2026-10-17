# @afilimax/aliexpress-scraper

[![NPM Version](https://img.shields.io/npm/v/@afilimax/aliexpress-scraper.svg)](https://www.npmjs.com/package/@afilimax/aliexpress-scraper)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

O `@afilimax/aliexpress-scraper` é uma biblioteca TypeScript de alta performance e resiliência para busca e extração estruturada de dados de produtos do **AliExpress**, integrada ao ecossistema **Afilimax** e focada no catálogo e moeda do **Brasil (BRL)**.

Construída com foco em resiliência e velocidade, a biblioteca opera com estratégia em camadas:
1. **Camada Primária (HTTP Ultrarrápida com Impit)**: Consome a listagem brasileira (`pt.aliexpress.com`) com emulação de browser Chrome e cookies de localização (`BRL` / `BR`) via [`impit`](https://www.npmjs.com/package/impit), extraindo dados nativos do bloco estruturado `_init_data_`.
2. **Camada de Fallback (Puppeteer Stealth)**: Caso ocorra bloqueio ou desafio anti-bot, a biblioteca aciona automaticamente o navegador automatizado com `puppeteer-extra-plugin-stealth` para renderizar a página.

---

## ✨ Principais Características

- **⚡ Alta Performance**: Extração ultrarrápida (geralmente < 1s) sem overhead de navegador para a maioria das consultas.
- **🛡️ Fallback Anti-Bot com Stealth**: Equipado com Puppeteer Stealth para contornar verificações dinâmicas quando necessário.
- **🇧🇷 Focado no Brasil (BRL)**: Configurado nativamente para catálogo em português (`pt.aliexpress.com`) e conversão de preços em Reais (`BRL`).
- **🔍 Retorno Padronizado**: Resultados entregues na interface universal `ScrapedProductPreview` do `@afilimax/core`.
- **📦 100% TypeScript**: Tipagem estrita com autocompletar e validação de contratos.

---

## 🚀 Instalação

```bash
npm install @afilimax/aliexpress-scraper
```

> [!IMPORTANT]
> Este pacote utiliza o `@afilimax/core` como dependência de par (*peer dependency*). Certifique-se de tê-lo instalado no seu projeto:
> ```bash
> npm install @afilimax/core
> ```

---

## 🛠️ Como Usar

### Exemplo Básico de Busca de Produtos

```typescript
import { AliExpressScraper } from "@afilimax/aliexpress-scraper"

async function run() {
    const scraper = new AliExpressScraper({
        quiet: false // Exibe logs do processo de scraping
    })

    try {
        console.log("Pesquisando produtos no AliExpress...")

        const products = await scraper.searchProducts({
            query: "fone bluetooth gamer",
            limit: 5
        })

        console.log(`Encontrados ${products.length} produtos:`)
        console.log(JSON.stringify(products, null, 2))
    } catch (error) {
        console.error("Erro na busca:", error)
    } finally {
        // Encerra instâncias abertas do navegador
        await scraper.close()
    }
}

run()
```

### Paginação

```typescript
const page2Products = await scraper.searchProducts({
    query: "smart watch",
    limit: 10,
    page: 2 // Página 2 dos resultados
})
```

---

## 📋 API Reference

### `AliExpressScraper`

#### `constructor(options?: AliExpressScraperOptions)`

| Opção | Tipo | Padrão | Descrição |
| :--- | :--- | :--- | :--- |
| `timeout` | `number` | `30000` | Tempo limite da requisição em milissegundos. |
| `quiet` | `boolean` | `true` | Se `false`, emite logs detalhados de diagnóstico no console. |

#### `searchProducts(options: AliExpressSearchProductsOptions): Promise<ScrapedProductPreview[]>`

Realiza a busca de produtos na listagem do AliExpress Brasil e retorna uma lista padronizada.

| Parâmetro | Tipo | Padrão | Descrição |
| :--- | :--- | :--- | :--- |
| `query` | `string` | **Obrigatório** | Termo de pesquisa (ex: `"teclado mecanico"`). |
| `limit` | `number` | `20` | Quantidade máxima de itens a retornar. |
| `page` | `number` | `1` | Número da página de resultados. |

#### `close(): Promise<void>`

Encerra instâncias do navegador subjacente se tiverem sido abertas pelo fallback.

---

## 🗃️ Estrutura do Objeto Retornado (`ScrapedProductPreview`)

```typescript
{
    marketplace: "aliexpress",
    externalId: "1005009120888793",
    title: "SmaILWOLF L80 Bluetooth sem fio com microfone para jogos",
    url: "https://pt.aliexpress.com/item/1005009120888793.html",
    thumbnail: "https://ae-pic-a1.aliexpress-media.com/kf/S4e9ae2cb.jpg",
    price: {
        value: 113.99,
        originalValue: 229.98,
        currency: "BRL"
    },
    rating: {
        average: 4.9,
        totalReviews: 850
    },
    brand: "Little Goldfish Digital Store",
    scrapedAt: "2026-10-17T21:34:16.832Z"
}
```

---

## 🧪 Scripts do Projeto

- `npm run build`: Compila o código TypeScript para a pasta `dist`.
- `npm run test`: Executa os testes automatizados com o Vitest.
- `npm run lint`: Valida e corrige as regras de código com ESLint.
- `npm run format`: Formata o código com Prettier.

---

## 📄 Licença

Distribuído sob a licença **MIT**. Desenvolvido com ❤️ pelo ecossistema **Afilimax**.