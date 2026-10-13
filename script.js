
"use strict";

/* ==========================================
   DEPÓSITO CUMARU
   Catálogo, preços, carrinho e WhatsApp
========================================== */

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
let timerConfiguracao = null;
let timerNotificacao = null;
let versaoConfiguracao = 0;
let versaoProdutos = 0;

const $ = (seletor) => document.querySelector(seletor);

const elementos = {
  avisoEvento: $("#aviso-evento"),
  listaCategorias: $("#lista-categorias"),
  gradeProdutos: $("#grade-produtos"),
  estadoProdutos: $("#estado-produtos"),
  quantidadeProdutos: $("#quantidade-produtos"),
  buscar: $("#buscar-produto"),
  filtro: $("#filtro-categoria"),
  abrirCarrinho: $("#abrir-carrinho"),
  fecharCarrinho: $("#fechar-carrinho"),
  painelCarrinho: $("#painel-carrinho"),
  fundoModal: $("#fundo-modal"),
  itensCarrinho: $("#itens-carrinho"),
  contadorCarrinho: $("#contador-carrinho"),
  subtotalCarrinho: $("#subtotal-carrinho"),
  finalizarPedido: $("#finalizar-pedido"),
  notificacao: $("#notificacao"),
  linkWhatsappRodape: $("#link-whatsapp-rodape"),
  anoAtual: $("#ano-atual")
};

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
    currency: configuracao.moeda || "BRL"
  }).format(valor);
}

function notificar(mensagem) {
  if (!elementos.notificacao) return;

  elementos.notificacao.textContent = mensagem;
  elementos.notificacao.classList.add("visivel");

  clearTimeout(timerNotificacao);

  timerNotificacao = setTimeout(() => {
    elementos.notificacao.classList.remove("visivel");
  }, 2800);
}

async function buscarJSON(caminho) {
  const separador = caminho.includes("?") ? "&" : "?";
  const url = `${caminho}${separador}_=${Date.now()}`;

  const resposta = await fetch(url, {
    cache: "no-store"
  });

  if (!resposta.ok) {
    throw new Error(`Não foi possível carregar ${caminho}`);
  }

  return resposta.json();
}

function validarConfiguracao(dados) {
  if (!dados || typeof dados !== "object" || Array.isArray(dados)) {
    throw new Error("Configuração inválida.");
  }

  const percentual = Number(dados.aumentoGeralPercentual);
  const intervalo = Number(dados.atualizacaoSegundos);

  return {
    ...CONFIG_PADRAO,
    ...dados,
    modoEvento: dados.modoEvento === true,
    aumentoGeralPercentual:
      Number.isFinite(percentual)
        ? Math.max(0, Math.min(500, percentual))
        : CONFIG_PADRAO.aumentoGeralPercentual,
    atualizacaoSegundos:
      Number.isFinite(intervalo)
        ? Math.max(10, Math.min(3600, intervalo))
        : CONFIG_PADRAO.atualizacaoSegundos,
    whatsapp: String(dados.whatsapp || "").replace(/\D/g, "")
  };
}

function validarProdutos(dados) {
  if (!dados || !Array.isArray(dados.produtos)) {
    throw new Error("O arquivo produtos.json precisa conter uma lista produtos.");
  }

  const ids = new Set();

  return dados.produtos.filter((produto) => {
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
  }).map((produto) => ({
    ...produto,
    id: String(produto.id),
    nome: String(produto.nome),
    categoria: String(produto.categoria || "Outros"),
    descricao: String(produto.descricao || ""),
    preco: Number(produto.preco),
    imagem: String(produto.imagem || ""),
    disponivel: produto.disponivel !== false,
    destaque: produto.destaque === true,
    aumentoEvento:
      produto.aumentoEvento === null ||
      produto.aumentoEvento === undefined ||
      produto.aumentoEvento === ""
        ? null
        : Number(produto.aumentoEvento)
  }));
}

/* PREÇOS */

function obterPreco(produto) {
  const precoOriginal = Number(produto.preco);

  if (!configuracao.modoEvento) {
    return precoOriginal;
  }

  let percentual = configuracao.aumentoGeralPercentual;

  if (produto.aumentoEvento !== null) {
    percentual = Number.isFinite(produto.aumentoEvento)
      ? Math.max(0, Math.min(500, produto.aumentoEvento))
      : percentual;
  }

  return Math.round(
    (precoOriginal * (1 + percentual / 100) + Number.EPSILON) * 100
  ) / 100;
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

  return Math.round((total + Number.EPSILON) * 100) / 100;
}

/* CATEGORIAS */

function obterCategorias() {
  const existentes = [...new Set(
    produtos.map((produto) => produto.categoria)
  )];

  const conhecidas = CATEGORIAS_PADRAO.filter((categoria) =>
    existentes.includes(categoria.nome)
  );

  const adicionais = existentes
    .filter((nome) => !CATEGORIAS_PADRAO.some((item) => item.nome === nome))
    .map((nome) => ({ nome, icone: "🍹" }));

  return [...conhecidas, ...adicionais];
}

function renderizarCategorias() {
  if (!elementos.listaCategorias || !elementos.filtro) return;

  const categorias = obterCategorias();

  elementos.listaCategorias.innerHTML = [
    `
      <button
        class="categoria-card ${categoriaAtiva === "todas" ? "ativa" : ""}"
        type="button"
        data-categoria="todas">
        <span class="categoria-icone">🛍️</span>
        <strong>Todas as bebidas</strong>
      </button>
    `,
    ...categorias.map((categoria) => `
      <button
        class="categoria-card ${categoriaAtiva === categoria.nome ? "ativa" : ""}"
        type="button"
        data-categoria="${escaparHTML(categoria.nome)}">
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

/* PRODUTOS */

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

function renderizarProdutos() {
  if (!elementos.gradeProdutos) return;

  const lista = produtos.filter(produtoCorrespondeFiltro);

  if (elementos.quantidadeProdutos) {
    elementos.quantidadeProdutos.textContent =
      `${lista.length} ${lista.length === 1 ? "produto" : "produtos"}`;
  }

  if (elementos.estadoProdutos) {
    elementos.estadoProdutos.textContent = "";
    elementos.estadoProdutos.hidden = true;
  }

  if (!lista.length) {
    elementos.gradeProdutos.innerHTML = `
      <div class="estado-vazio">
        <strong>Nenhum produto encontrado</strong>
        <span>Tente outra busca ou escolha uma categoria diferente.</span>
      </div>
    `;
    return;
  }

  elementos.gradeProdutos.innerHTML = lista.map((produto) => {
    const preco = obterPreco(produto);
    const quantidade = carrinho.get(produto.id) || 0;

    const indisponivel = !produto.disponivel &&
      !configuracao.permitirProdutosIndisponiveisNoCarrinho;

    const selo = !produto.disponivel
      ? '<span class="etiqueta-indisponivel">Indisponível</span>'
      : produto.destaque
        ? '<span class="etiqueta-oferta">Destaque</span>'
        : "";

    const imagem = produto.imagem
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
              <small>${configuracao.modoEvento ? "Preço de evento" : "Preço"}</small>
              <strong>${formatarDinheiro(preco)}</strong>
            </div>

            <button
              type="button"
              class="botao-adicionar"
              data-adicionar="${escaparHTML(produto.id)}"
              aria-label="Adicionar ${escaparHTML(produto.nome)}"
              ${indisponivel ? "disabled" : ""}>
              ${quantidade > 0 ? "+" : "+"}
            </button>
          </div>
        </div>
      </article>
    `;
  }).join("");
}

/* CARRINHO */

function adicionarProduto(id) {
  const produto = obterProduto(id);

  if (!produto) return;

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
    elementos.contadorCarrinho.textContent = obterQuantidadeCarrinho();
  }

  if (elementos.subtotalCarrinho) {
    elementos.subtotalCarrinho.textContent = formatarDinheiro(obterSubtotal());
  }

  if (elementos.finalizarPedido) {
    elementos.finalizarPedido.disabled = carrinho.size === 0;
  }

  if (carrinho.size === 0) {
    elementos.itensCarrinho.innerHTML = `
      <div class="carrinho-vazio">
        <span>🛒</span>
        <h3>Seu carrinho está vazio</h3>
        <p>Adicione algumas bebidas para começar.</p>
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
    }).join("");
}

/* ABRIR E FECHAR CARRINHO */

function abrirCarrinho() {
  elementos.painelCarrinho?.classList.add("aberto");
  elementos.painelCarrinho?.setAttribute("aria-hidden", "false");
  elementos.painelCarrinho?.removeAttribute("inert");

  if (elementos.fundoModal) {
    elementos.fundoModal.hidden = false;
  }

  document.body.classList.add("modal-aberto");
  elementos.fecharCarrinho?.focus();
}

function fecharCarrinho() {
  elementos.painelCarrinho?.classList.remove("aberto");
  elementos.painelCarrinho?.setAttribute("aria-hidden", "true");
  elementos.painelCarrinho?.setAttribute("inert", "");

  if (elementos.fundoModal) {
    elementos.fundoModal.hidden = true;
  }

  document.body.classList.remove("modal-aberto");
  elementos.abrirCarrinho?.focus();
}

/* WHATSAPP */

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
    `Olá! Quero fazer um pedido no ${configuracao.nomeDeposito}.`,
    "",
    "MEU PEDIDO:"
  ];

  for (const [id, quantidade] of carrinho.entries()) {
    const produto = obterProduto(id);

    if (!produto) continue;

    if (!produto.disponivel) {
      notificar(`Confira a disponibilidade de ${produto.nome}.`);
      return;
    }

    const precoUnitario = obterPreco(produto);
    const totalProduto = precoUnitario * quantidade;

    linhas.push(
      `${quantidade}x ${produto.nome} — ${formatarDinheiro(totalProduto)}`
    );
  }

  linhas.push("");
  linhas.push(`Subtotal: ${formatarDinheiro(obterSubtotal())}`);

  if (configuracao.modoEvento) {
    linhas.push("Pedido durante período de evento.");
  }

  linhas.push("");
  linhas.push("Por favor, confirme a disponibilidade e a entrega.");

  const url =
    `https://wa.me/${configuracao.whatsapp}?text=` +
    encodeURIComponent(linhas.join("\n"));

  window.open(url, "_blank", "noopener,noreferrer");
}

/* CONFIGURAÇÕES E ATUALIZAÇÃO */

async function atualizarConfiguracao() {
  try {
    const nova = validarConfiguracao(
      await buscarJSON(ARQUIVOS.config)
    );

    const mudou =
      JSON.stringify(nova) !== JSON.stringify(configuracao);

    configuracao = nova;

    if (mudou) {
      versaoConfiguracao++;

      if (elementos.avisoEvento) {
        elementos.avisoEvento.hidden = !configuracao.modoEvento;

        const texto = elementos.avisoEvento.querySelector("span:last-child");

        if (texto && configuracao.modoEvento) {
          texto.textContent = configuracao.mensagemEvento;
        }
      }

      if (elementos.linkWhatsappRodape && configuracao.whatsapp) {
        elementos.linkWhatsappRodape.href =
          `https://wa.me/${configuracao.whatsapp}`;
      }

      renderizarProdutos();
      renderizarCarrinho();
    }

    return true;
  } catch (erro) {
    console.error("Erro ao atualizar configurações:", erro);
    return false;
  }
}

async function atualizarProdutos() {
  try {
    const dados = validarProdutos(
      await buscarJSON(ARQUIVOS.produtos)
    );

    produtos = dados;
    versaoProdutos++;

    // Retira do carrinho itens que deixaram de existir.
    for (const id of carrinho.keys()) {
      if (!obterProduto(id)) {
        carrinho.delete(id);
      }
    }

    renderizarCategorias();
    renderizarProdutos();
    renderizarCarrinho();

    if (elementos.estadoProdutos) {
      elementos.estadoProdutos.hidden = true;
    }

    return true;
  } catch (erro) {
    console.error("Erro ao carregar produtos:", erro);

    if (elementos.estadoProdutos) {
      elementos.estadoProdutos.hidden = false;
      elementos.estadoProdutos.textContent =
        "Não foi possível carregar os produtos. Tente recarregar a página.";
    }

    return false;
  }
}

function iniciarAtualizacaoAutomatica() {
  clearInterval(timerConfiguracao);

  timerConfiguracao = setInterval(async () => {
    await atualizarConfiguracao();
    await atualizarProdutos();
  }, configuracao.atualizacaoSegundos * 1000);
}

/* EVENTOS DA INTERFACE */

function configurarEventos() {
  elementos.buscar?.addEventListener("input", (evento) => {
    buscaAtual = evento.target.value.trim();
    renderizarProdutos();
  });

  elementos.filtro?.addEventListener("change", (evento) => {
    categoriaAtiva = evento.target.value;
    renderizarCategorias();
    renderizarProdutos();
  });

  elementos.listaCategorias?.addEventListener("click", (evento) => {
    const botao = evento.target.closest("[data-categoria]");

    if (!botao) return;

    categoriaAtiva = botao.dataset.categoria;

    renderizarCategorias();
    renderizarProdutos();

    $("#produtos")?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
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
  elementos.fecharCarrinho?.addEventListener("click", fecharCarrinho);
  elementos.fundoModal?.addEventListener("click", fecharCarrinho);
  elementos.finalizarPedido?.addEventListener("click", finalizarPedido);

  document.addEventListener("keydown", (evento) => {
    if (evento.key === "Escape") {
      fecharCarrinho();
    }
  });

  elementos.anoAtual.textContent = new Date().getFullYear();
}

/* INICIALIZAÇÃO */

async function iniciarSite() {
  configurarEventos();

  await atualizarConfiguracao();
  await atualizarProdutos();

  renderizarCategorias();
  renderizarProdutos();
  renderizarCarrinho();

  iniciarAtualizacaoAutomatica();
}

iniciarSite();
