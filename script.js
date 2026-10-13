```javascript
"use strict";

/* =========================================
   DEPÓSITO CUMARU
   Catálogo, preços, carrinho e WhatsApp
========================================= */

const ARQUIVOS = {
  produtos: "./produtos.json",
  config: "./config.json"
};

const CONFIG_PADRAO = {
  nomeDeposito: "Depósito Cumaru",
  whatsapp: "",
  modoEvento: false,
  aumentoGeralPercentual: 20,
  atualizacaoSegundos: 30,
  moeda: "BRL",
  mensagemEvento: "Preços especiais para o evento de hoje!",
  mensagemWhatsApp:
    "Olá! Gostaria de fazer um pedido no Depósito Cumaru.",
  endereco: "",
  permitirProdutosIndisponiveisNoCarrinho: false
};

const CATEGORIAS_PADRAO = [
  { nome: "Cervejas", icone: "🍺" },
  { nome: "Refrigerantes", icone: "🥤" },
  { nome: "Energéticos", icone: "⚡" },
  { nome: "Destilados", icone: "🥃" },
  { nome: "Águas", icone: "💧" },
  { nome: "Gelo", icone: "🧊" },
  { nome: "Outros", icone: "🍹" }
];

let produtos = [];
let configuracao = { ...CONFIG_PADRAO };
let carrinho = new Map();
let categoriaAtiva = "todas";
let buscaAtual = "";

let timerAtualizacao = null;
let timerNotificacao = null;
let carregando = false;

const $ = (seletor) => document.querySelector(seletor);

const elementos = {
  avisoEvento: $("#aviso-evento"),
  textoAvisoEvento: $("#texto-aviso-evento"),

  listaCategorias: $("#lista-categorias"),
  gradeProdutos: $("#grade-produtos"),
  mensagemCatalogo: $("#mensagem-catalogo"),

  buscar: $("#buscar-produto"),
  filtro: $("#filtro-categoria"),

  abrirCarrinho: $("#abrir-carrinho"),
  abrirCarrinhoContato: $("#abrir-carrinho-contato"),
  fecharCarrinho: $("#fechar-carrinho"),

  painelCarrinho: $("#painel-carrinho"),
  fundoModal: $("#fundo-modal"),

  itensCarrinho: $("#itens-carrinho"),
  contadorCarrinho: $("#contador-carrinho"),
  subtotalCarrinho: $("#subtotal-carrinho"),
  finalizarPedido: $("#finalizar-pedido"),

  notificacao: $("#notificacao"),

  linkWhatsappRodape: $("#link-whatsapp-rodape"),
  enderecoRodape: $("#endereco-rodape"),
  anoAtual: $("#ano-atual")
};

/* =========================================
   FUNÇÕES AUXILIARES
========================================= */

function escaparHTML(valor) {
  return String(valor ?? "").replace(/[&<>"']/g, (caractere) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[caractere]);
}

function formatarDinheiro(valor) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: configuracao.moeda
  }).format(valor);
}

function arredondarDinheiro(valor) {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}

function notificar(mensagem) {
  if (!elementos.notificacao) return;

  elementos.notificacao.textContent = mensagem;
  elementos.notificacao.hidden = false;
  elementos.notificacao.classList.add("visivel");

  clearTimeout(timerNotificacao);

  timerNotificacao = setTimeout(() => {
    elementos.notificacao.classList.remove("visivel");
    elementos.notificacao.hidden = true;
  }, 3000);
}

async function buscarJSON(caminho) {
  const separador = caminho.includes("?") ? "&" : "?";
  const url = `${caminho}${separador}_=${Date.now()}`;

  const resposta = await fetch(url, {
    cache: "no-store"
  });

  if (!resposta.ok) {
    throw new Error(
      `Não foi possível carregar ${caminho}. HTTP ${resposta.status}`
    );
  }

  return resposta.json();
}

/* =========================================
   CONFIGURAÇÕES
========================================= */

function validarConfiguracao(dados) {
  if (!dados || typeof dados !== "object" || Array.isArray(dados)) {
    throw new Error("O arquivo config.json é inválido.");
  }

  const percentual = Number(dados.aumentoGeralPercentual);
  const intervalo = Number(dados.atualizacaoSegundos);

  const moedaInformada = String(dados.moeda || "BRL").toUpperCase();

  let moedaValida = "BRL";

  try {
    new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: moedaInformada
    });

    moedaValida = moedaInformada;
  } catch {
    console.warn("Moeda inválida. Usando BRL.");
  }

  return {
    ...CONFIG_PADRAO,
    ...dados,

    nomeDeposito: String(
      dados.nomeDeposito || CONFIG_PADRAO.nomeDeposito
    ),

    whatsapp: String(dados.whatsapp || "").replace(/\D/g, ""),

    modoEvento: dados.modoEvento === true,

    aumentoGeralPercentual: Number.isFinite(percentual)
      ? Math.max(0, Math.min(500, percentual))
      : CONFIG_PADRAO.aumentoGeralPercentual,

    atualizacaoSegundos: Number.isFinite(intervalo)
      ? Math.max(10, Math.min(3600, intervalo))
      : CONFIG_PADRAO.atualizacaoSegundos,

    moeda: moedaValida,

    mensagemEvento: String(
      dados.mensagemEvento || CONFIG_PADRAO.mensagemEvento
    ),

    mensagemWhatsApp: String(
      dados.mensagemWhatsApp || CONFIG_PADRAO.mensagemWhatsApp
    ),

    endereco: String(dados.endereco || ""),

    permitirProdutosIndisponiveisNoCarrinho:
      dados.permitirProdutosIndisponiveisNoCarrinho === true
  };
}

function atualizarInformacoesRodape() {
  if (elementos.anoAtual) {
    elementos.anoAtual.textContent = new Date().getFullYear();
  }

  if (elementos.enderecoRodape) {
    elementos.enderecoRodape.textContent = configuracao.endereco;
    elementos.enderecoRodape.hidden = !configuracao.endereco;
  }

  if (elementos.linkWhatsappRodape) {
    if (configuracao.whatsapp) {
      elementos.linkWhatsappRodape.href =
        `https://wa.me/${configuracao.whatsapp}`;

      elementos.linkWhatsappRodape.hidden = false;
    } else {
      elementos.linkWhatsappRodape.removeAttribute("href");
    }
  }
}

function atualizarAvisoEvento() {
  if (!elementos.avisoEvento) return;

  elementos.avisoEvento.hidden = !configuracao.modoEvento;

  if (elementos.textoAvisoEvento) {
    elementos.textoAvisoEvento.textContent =
      configuracao.modoEvento
        ? configuracao.mensagemEvento
        : "";
  }
}

/* =========================================
   VALIDAÇÃO DOS PRODUTOS
========================================= */

function validarProdutos(dados) {
  if (!dados || !Array.isArray(dados.produtos)) {
    throw new Error(
      "O produtos.json precisa conter uma lista chamada produtos."
    );
  }

  const ids = new Set();

  return dados.produtos
    .filter((produto) => {
      if (!produto || typeof produto !== "object") return false;

      const id = String(produto.id || "").trim();
      const nome = String(produto.nome || "").trim();
      const preco = Number(produto.preco);

      if (
        !id ||
        !nome ||
        !Number.isFinite(preco) ||
        preco < 0 ||
        ids.has(id)
      ) {
        console.warn("Produto ignorado por dados inválidos:", produto);
        return false;
      }

      ids.add(id);
      return true;
    })
    .map((produto) => {
      let aumentoEvento = null;

      if (
        produto.aumentoEvento !== null &&
        produto.aumentoEvento !== undefined &&
        produto.aumentoEvento !== ""
      ) {
        const valor = Number(produto.aumentoEvento);

        aumentoEvento = Number.isFinite(valor)
          ? Math.max(0, Math.min(500, valor))
          : null;
      }

      return {
        ...produto,
        id: String(produto.id),
        nome: String(produto.nome),
        categoria: String(produto.categoria || "Outros"),
        descricao: String(produto.descricao || ""),
        preco: Number(produto.preco),
        imagem: String(produto.imagem || ""),
        disponivel: produto.disponivel !== false,
        destaque: produto.destaque === true,
        aumentoEvento
      };
    });
}

/* =========================================
   PREÇOS
========================================= */

function obterPreco(produto) {
  const precoOriginal = Number(produto.preco);

  if (!configuracao.modoEvento) {
    return precoOriginal;
  }

  let percentual = configuracao.aumentoGeralPercentual;

  /*
    null = usa o aumento geral.
    0 = não aumenta o preço deste produto.
    Outro número = usa o percentual individual.
  */

  if (produto.aumentoEvento !== null) {
    percentual = produto.aumentoEvento;
  }

  return arredondarDinheiro(
    precoOriginal * (1 + percentual / 100)
  );
}

function obterProduto(id) {
  return produtos.find((produto) => produto.id === id);
}

function obterQuantidadeCarrinho() {
  let total = 0;

  for (const quantidade of carrinho.values()) {
    total += quantidade;
  }

  return total;
}

function obterSubtotal() {
  let total = 0;

  for (const [id, quantidade] of carrinho.entries()) {
    const produto = obterProduto(id);

    if (produto) {
      total += obterPreco(produto) * quantidade;
    }
  }

  return arredondarDinheiro(total);
}

/* =========================================
   CATEGORIAS
========================================= */

function obterCategorias() {
  const existentes = [
    ...new Set(produtos.map((produto) => produto.categoria))
  ];

  const conhecidas = CATEGORIAS_PADRAO.filter((categoria) =>
    existentes.includes(categoria.nome)
  );

  const adicionais = existentes
    .filter(
      (nome) =>
        !CATEGORIAS_PADRAO.some(
          (categoria) => categoria.nome === nome
        )
    )
    .map((nome) => ({
      nome,
      icone: "🍹"
    }));

  return [...conhecidas, ...adicionais];
}

function renderizarCategorias() {
  if (!elementos.listaCategorias || !elementos.filtro) return;

  const categorias = obterCategorias();

  if (
    categoriaAtiva !== "todas" &&
    !categorias.some((categoria) => categoria.nome === categoriaAtiva)
  ) {
    categoriaAtiva = "todas";
  }

  elementos.listaCategorias.innerHTML = [
    `
      <button
        class="categoria-card ${categoriaAtiva === "todas" ? "ativa" : ""}"
        type="button"
        data-categoria="todas"
        aria-pressed="${categoriaAtiva === "todas"}">
        <span class="categoria-icone">🛍️</span>
        <strong>Todas as bebidas</strong>
      </button>
    `,

    ...categorias.map((categoria) => `
      <button
        class="categoria-card ${categoriaAtiva === categoria.nome ? "ativa" : ""}"
        type="button"
        data-categoria="${escaparHTML(categoria.nome)}"
        aria-pressed="${categoriaAtiva === categoria.nome}">
        <span class="categoria-icone">${escaparHTML(categoria.icone)}</span>
        <strong>${escaparHTML(categoria.nome)}</strong>
      </button>
    `)
  ].join("");

  elementos.filtro.innerHTML = `
    <option value="todas">Todas as categorias</option>
    ${categorias.map((categoria) => `
      <option value="${escaparHTML(categoria.nome)}">
        ${escaparHTML(categoria.nome)}
      </option>
    `).join("")}
  `;

  elementos.filtro.value = categoriaAtiva;
}

/* =========================================
   FILTRO E BUSCA
========================================= */

function produtoCorrespondeBusca(produto) {
  const texto = [
    produto.nome,
    produto.categoria,
    produto.descricao
  ].join(" ").toLocaleLowerCase("pt-BR");

  return texto.includes(buscaAtual.toLocaleLowerCase("pt-BR"));
}

function produtoCorrespondeFiltro(produto) {
  return (
    (categoriaAtiva === "todas" ||
      produto.categoria === categoriaAtiva) &&
    produtoCorrespondeBusca(produto)
  );
}

/* =========================================
   RENDERIZAÇÃO DOS PRODUTOS
========================================= */

function renderizarProdutos() {
  if (!elementos.gradeProdutos) return;

  const lista = produtos.filter(produtoCorrespondeFiltro);

  if (elementos.mensagemCatalogo) {
    elementos.mensagemCatalogo.hidden = lista.length > 0;
    elementos.mensagemCatalogo.textContent = lista.length
      ? ""
      : "Nenhum produto encontrado. Tente outra busca ou categoria.";
  }

  if (!lista.length) {
    elementos.gradeProdutos.innerHTML = `
      <div class="estado-vazio">
        <strong>Nenhum produto encontrado</strong>
        <span>Tente outra busca ou escolha outra categoria.</span>
      </div>
    `;

    return;
  }

  elementos.gradeProdutos.innerHTML = lista.map((produto) => {
    const preco = obterPreco(produto);

    const indisponivel =
      !produto.disponivel &&
      !configuracao.permitirProdutosIndisponiveisNoCarrinho;

    const selo = !produto.disponivel
      ? '<span class="etiqueta-indisponivel">Indisponível</span>'
      : produto.destaque
        ? '<span class="etiqueta-oferta">Destaque</span>'
        : "";

    const imagemSegura =
      produto.imagem.startsWith("https://") ||
      produto.imagem.startsWith("http://") ||
      produto.imagem.startsWith("./") ||
      produto.imagem.startsWith("assets/");

    const imagem = produto.imagem && imagemSegura
      ? `
        <img
          src="${escaparHTML(produto.imagem)}"
          alt="${escaparHTML(produto.nome)}"
          loading="lazy"
          onerror="this.hidden=true;this.nextElementSibling.hidden=false">
        <span class="produto-placeholder" hidden>🍹</span>
      `
      : '<span class="produto-placeholder">🍹</span>';

    return `
      <article class="produto-card">
        <div class="produto-imagem">
          ${selo}
          ${imagem}
        </div>

        <div class="produto-info">
          <span class="produto-categoria">
            ${escaparHTML(produto.categoria)}
          </span>

          <h3>${escaparHTML(produto.nome)}</h3>

          <p class="produto-descricao">
            ${escaparHTML(produto.descricao)}
          </p>

          <div class="produto-rodape">
            <div class="produto-preco">
              <small>
                ${configuracao.modoEvento ? "Preço de evento" : "Preço"}
              </small>

              <strong>${formatarDinheiro(preco)}</strong>
            </div>

            <button
              type="button"
              class="botao-adicionar"
              data-adicionar="${escaparHTML(produto.id)}"
              aria-label="Adicionar ${escaparHTML(produto.nome)}"
              ${indisponivel ? "disabled" : ""}>
              +
            </button>
          </div>
        </div>
      </article>
    `;
  }).join("");
}

/* =========================================
   CARRINHO
========================================= */

function adicionarProduto(id) {
  const produto = obterProduto(id);

  if (!produto) {
    notificar("Produto não encontrado.");
    return;
  }

  if (
    !produto.disponivel &&
    !configuracao.permitirProdutosIndisponiveisNoCarrinho
  ) {
    notificar("Este produto está indisponível.");
    return;
  }

  carrinho.set(id, (carrinho.get(id) || 0) + 1);

  renderizarProdutos();
  renderizarCarrinho();

  notificar(`${produto.nome} adicionado ao pedido.`);
}

function alterarQuantidade(id, delta) {
  const produto = obterProduto(id);

  if (!produto) {
    carrinho.delete(id);
    renderizarCarrinho();
    return;
  }

  if (
    delta > 0 &&
    !produto.disponivel &&
    !configuracao.permitirProdutosIndisponiveisNoCarrinho
  ) {
    notificar("Este produto está indisponível.");
    return;
  }

  const atual = carrinho.get(id) || 0;
  const nova = atual + delta;

  if (nova <= 0) {
    carrinho.delete(id);
  } else {
    carrinho.set(id, nova);
  }

  renderizarProdutos();
  renderizarCarrinho();
}

function removerProduto(id) {
  carrinho.delete(id);

  renderizarProdutos();
  renderizarCarrinho();

  notificar("Produto removido do pedido.");
}

function renderizarCarrinho() {
  if (!elementos.itensCarrinho) return;

  if (elementos.contadorCarrinho) {
    elementos.contadorCarrinho.textContent =
      obterQuantidadeCarrinho();
  }

  if (elementos.subtotalCarrinho) {
    elementos.subtotalCarrinho.textContent =
      formatarDinheiro(obterSubtotal());
  }

  if (elementos.finalizarPedido) {
    elementos.finalizarPedido.disabled = carrinho.size === 0;
  }

  if (carrinho.size === 0) {
    elementos.itensCarrinho.innerHTML = `
      <div class="carrinho-vazio">
        <span>🛒</span>
        <h3>Seu carrinho está vazio</h3>
        <p>Adicione produtos para começar seu pedido.</p>
      </div>
    `;

    return;
  }

  elementos.itensCarrinho.innerHTML = [...carrinho.entries()]
    .map(([id, quantidade]) => {
      const produto = obterProduto(id);

      if (!produto) return "";

      return `
        <article class="item-carrinho">
          <div>
            <h3>${escaparHTML(produto.nome)}</h3>

            <div class="item-carrinho-preco">
              ${formatarDinheiro(obterPreco(produto) * quantidade)}
            </div>

            <div class="item-carrinho-controles">
              <button
                type="button"
                class="botao-quantidade"
                data-diminuir="${escaparHTML(id)}"
                aria-label="Diminuir quantidade">−</button>

              <span>${quantidade}</span>

              <button
                type="button"
                class="botao-quantidade"
                data-aumentar="${escaparHTML(id)}"
                aria-label="Aumentar quantidade">+</button>
            </div>
          </div>

          <button
            type="button"
            class="botao-remover"
            data-remover="${escaparHTML(id)}">
            Remover
          </button>
        </article>
      `;
    })
    .join("");
}

/* =========================================
   ABRIR E FECHAR CARRINHO
========================================= */

function abrirCarrinho() {
  if (!elementos.painelCarrinho) return;

  elementos.painelCarrinho.classList.add("aberto");
  elementos.painelCarrinho.setAttribute("aria-hidden", "false");
  elementos.painelCarrinho.removeAttribute("inert");

  if (elementos.fundoModal) {
    elementos.fundoModal.hidden = false;
  }

  document.body.classList.add("modal-aberto");

  elementos.fecharCarrinho?.focus();
}

function fecharCarrinho() {
  if (!elementos.painelCarrinho) return;

  elementos.painelCarrinho.classList.remove("aberto");
  elementos.painelCarrinho.setAttribute("aria-hidden", "true");
  elementos.painelCarrinho.setAttribute("inert", "");

  if (elementos.fundoModal) {
    elementos.fundoModal.hidden = true;
  }

  document.body.classList.remove("modal-aberto");

  elementos.abrirCarrinho?.focus();
}

/* =========================================
   FINALIZAÇÃO PELO WHATSAPP
========================================= */

function finalizarPedido() {
  if (carrinho.size === 0) {
    notificar("Adicione produtos antes de finalizar.");
    return;
  }

  if (!configuracao.whatsapp) {
    notificar("O WhatsApp ainda não foi configurado.");
    return;
  }

  const linhas = [
    configuracao.mensagemWhatsApp,
    "",
    `*${configuracao.nomeDeposito.toUpperCase()}*`,
    "",
    "*MEU PEDIDO:*"
  ];

  for (const [id, quantidade] of carrinho.entries()) {
    const produto = obterProduto(id);

    if (!produto) {
      notificar("Um produto não está mais disponível no catálogo.");
      return;
    }

    if (
      !produto.disponivel &&
      !configuracao.permitirProdutosIndisponiveisNoCarrinho
    ) {
      notificar(`${produto.nome} está indisponível.`);
      return;
    }

    const precoUnitario = obterPreco(produto);
    const totalProduto = precoUnitario * quantidade;

    linhas.push(
      `${quantidade}x ${produto.nome} — ${formatarDinheiro(totalProduto)}`
    );
  }

  linhas.push("");
  linhas.push(`*Subtotal estimado: ${formatarDinheiro(obterSubtotal())}*`);

  if (configuracao.modoEvento) {
    linhas.push("");
    linhas.push("Pedido durante período de evento.");
  }

  if (configuracao.endereco) {
    linhas.push("");
    linhas.push(`Endereço do depósito: ${configuracao.endereco}`);
  }

  linhas.push("");
  linhas.push("Por favor, confirme a disponibilidade e a entrega.");

  const url =
    `https://wa.me/${configuracao.whatsapp}?text=` +
    encodeURIComponent(linhas.join("\n"));

  window.open(url, "_blank", "noopener,noreferrer");
}

/* =========================================
   ATUALIZAÇÃO DAS CONFIGURAÇÕES
========================================= */

async function atualizarConfiguracao() {
  try {
    const dados = await buscarJSON(ARQUIVOS.config);
    const nova = validarConfiguracao(dados);

    const mudou =
      JSON.stringify(nova) !== JSON.stringify(configuracao);

    configuracao = nova;

    atualizarInformacoesRodape();
    atualizarAvisoEvento();

    if (mudou) {
      renderizarProdutos();
      renderizarCarrinho();

      // Recalcula o intervalo caso ele tenha sido alterado no JSON.
      iniciarAtualizacaoAutomatica();
    }

    return true;
  } catch (erro) {
    console.error("Erro ao atualizar configurações:", erro);
    return false;
  }
}

/* =========================================
   ATUALIZAÇÃO DO CATÁLOGO
========================================= */

async function atualizarProdutos() {
  try {
    const dados = await buscarJSON(ARQUIVOS.produtos);
    const novosProdutos = validarProdutos(dados);

    produtos = novosProdutos;

    // Remove do carrinho produtos excluídos do catálogo.
    for (const id of [...carrinho.keys()]) {
      if (!obterProduto(id)) {
        carrinho.delete(id);
      }
    }

    // Remove ou mantém produtos indisponíveis conforme a configuração.
    if (!configuracao.permitirProdutosIndisponiveisNoCarrinho) {
      for (const id of [...carrinho.keys()]) {
        const produto = obterProduto(id);

        if (produto && !produto.disponivel) {
          carrinho.delete(id);
        }
      }
    }

    renderizarCategorias();
    renderizarProdutos();
    renderizarCarrinho();

    if (elementos.mensagemCatalogo) {
      elementos.mensagemCatalogo.hidden = produtos.length > 0;
    }

    return true;
  } catch (erro) {
    console.error("Erro ao carregar produtos:", erro);

    if (elementos.gradeProdutos) {
      elementos.gradeProdutos.innerHTML = `
        <div class="estado-vazio">
          <strong>Não foi possível carregar os produtos</strong>
          <span>Confira os arquivos produtos.json e config.json e tente novamente.</span>
        </div>
      `;
    }

    return false;
  }
}

/* =========================================
   ATUALIZAÇÃO AUTOMÁTICA
========================================= */

function iniciarAtualizacaoAutomatica() {
  clearInterval(timerAtualizacao);

  timerAtualizacao = setInterval(async () => {
    if (carregando) return;

    carregando = true;

    try {
      await atualizarConfiguracao();
      await atualizarProdutos();
    } finally {
      carregando = false;
    }
  }, configuracao.atualizacaoSegundos * 1000);
}

/* =========================================
   EVENTOS DA INTERFACE
========================================= */

function configurarEventos() {
  elementos.buscar?.addEventListener("input", (evento) => {
    buscaAtual = evento.target.value.trim();
    renderizarProdutos();
  });

  elementos.filtro?.addEventListener("change", (evento) => {
    categoriaAtiva = evento.target.value || "todas";
    renderizarCategorias();
    renderizarProdutos();
  });

  elementos.listaCategorias?.addEventListener("click", (evento) => {
    const botao = evento.target.closest("[data-categoria]");

    if (!botao) return;

    categoriaAtiva = botao.dataset.categoria || "todas";

    renderizarCategorias();
    renderizarProdutos();
  });

  elementos.gradeProdutos?.addEventListener("click", (evento) => {
    const botao = evento.target.closest("[data-adicionar]");

    if (botao) {
      adicionarProduto(botao.dataset.adicionar);
    }
  });

  elementos.itensCarrinho?.addEventListener("click", (evento) => {
    const aumentar = evento.target.closest("[data-aumentar]");
    const diminuir = evento.target.closest("[data-diminuir]");
    const remover = evento.target.closest("[data-remover]");

    if (aumentar) {
      alterarQuantidade(aumentar.dataset.aumentar, 1);
    } else if (diminuir) {
      alterarQuantidade(diminuir.dataset.diminuir, -1);
    } else if (remover) {
      removerProduto(remover.dataset.remover);
    }
  });

  elementos.abrirCarrinho?.addEventListener("click", abrirCarrinho);

  elementos.abrirCarrinhoContato?.addEventListener(
    "click",
    abrirCarrinho
  );

  elementos.fecharCarrinho?.addEventListener(
    "click",
    fecharCarrinho
  );

  elementos.fundoModal?.addEventListener(
    "click",
    fecharCarrinho
  );

  elementos.finalizarPedido?.addEventListener(
    "click",
    finalizarPedido
  );

  document.addEventListener("keydown", (evento) => {
    if (
      evento.key === "Escape" &&
      elementos.painelCarrinho?.classList.contains("aberto")
    ) {
      fecharCarrinho();
    }
  });
}

/* =========================================
   INICIALIZAÇÃO
========================================= */

async function iniciarSite() {
  configurarEventos();

  atualizarInformacoesRodape();

  if (elementos.painelCarrinho) {
    elementos.painelCarrinho.setAttribute("inert", "");
  }

  const configuracaoCarregada = await atualizarConfiguracao();

  if (!configuracaoCarregada) {
    notificar("Não foi possível carregar as configurações.");
  }

  await atualizarProdutos();

  renderizarCategorias();
  renderizarProdutos();
  renderizarCarrinho();

  iniciarAtualizacaoAutomatica();
}

iniciarSite();
```
