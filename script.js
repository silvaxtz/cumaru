"use strict";

/* DEPÓSITO CUMARU — catálogo, embalagens e pedidos */

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
  endereco: "",
  permitirProdutosIndisponiveisNoCarrinho: false
};

const ICONES = {
  todas: '<path d="M3 7h18M5 7l1 13h12l1-13M9 7V5a3 3 0 0 1 6 0v2"/>',
  cerveja: '<path d="M7 3h8l1 4-1 14H6L5 7zM16 8h3l1 2v5l-2 2h-3M8 10h5"/>',
  aguas_sucos: '<path d="M12 2S5 10 5 15a7 7 0 0 0 14 0c0-5-7-13-7-13zM9 16a3 3 0 0 0 3 3"/>',
  refrigerante: '<path d="M9 3h6v3l2 3-1 12H8L7 9l2-3zM9 6h6M8 10h8M10 14h4"/>',
  energetico: '<path d="m13 2-8 12h6l-1 8 9-13h-6z"/>',
  vinho: '<path d="M8 3h8l-1 7a3 3 0 0 1-6 0L8 3zM12 13v7M8 21h8M9 7h6"/>',
  destilado: '<path d="M9 3h6v4l3 4v10H6V11l3-4zM9 7h6M7 13h10"/>',
  agua: '<path d="M12 2S5 10 5 15a7 7 0 0 0 14 0c0-5-7-13-7-13zM9 16a3 3 0 0 0 3 3"/>',
  gelo: '<path d="m12 2 8 5v10l-8 5-8-5V7zM4 7l8 5 8-5M12 12v10"/>',
  outros: '<path d="M4 5h16v14H4zM8 9h8M8 13h5"/>'
};

const CATEGORIAS_PADRAO = [
  { nome: "Cervejas", icone: "cerveja" },
  { nome: "Refrigerantes", icone: "refrigerante" },
  { nome: "Energéticos", icone: "energetico" },
  { nome: "Vinhos", icone: "vinho" },
  { nome: "Destilados", icone: "destilado" },
  { nome: "Águas e Sucos", icone: "aguas_sucos" },
  { nome: "Gelo", icone: "gelo" },
  { nome: "Outros", icone: "outros" }
];

let produtos = [];
let configuracao = { ...CONFIG_PADRAO };
let carrinho = new Map();
let categoriaAtiva = "todas";
let buscaAtual = "";
let timerConfiguracao = null;
let timerNotificacao = null;

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

/* UTILITÁRIOS */

function escaparHTML(valor) {
  return String(valor ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[c]);
}

function formatarDinheiro(valor) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: configuracao.moeda || "BRL"
  }).format(Number(valor) || 0);
}

function iconeSVG(nome) {
  const desenho = ICONES[nome] || ICONES.outros;
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true"
         fill="none" stroke="currentColor" stroke-width="1.6"
         stroke-linecap="round" stroke-linejoin="round">
      ${desenho}
    </svg>
  `;
}

function iconeCategoria(nome) {
  const categoria = CATEGORIAS_PADRAO.find((item) => item.nome === nome);
  return iconeSVG(categoria?.icone || "outros");
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
  const resposta = await fetch(
    `${caminho}${separador}_=${Date.now()}`,
    { cache: "no-store" }
  );

  if (!resposta.ok) {
    throw new Error(`Não foi possível carregar ${caminho} (HTTP ${resposta.status})`);
  }

  return resposta.json();
}

/* CONFIGURAÇÃO */

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
    aumentoGeralPercentual: Number.isFinite(percentual)
      ? Math.max(0, Math.min(500, percentual))
      : CONFIG_PADRAO.aumentoGeralPercentual,
    atualizacaoSegundos: Number.isFinite(intervalo)
      ? Math.max(10, Math.min(3600, intervalo))
      : CONFIG_PADRAO.atualizacaoSegundos,
    whatsapp: String(dados.whatsapp || "").replace(/\D/g, "")
  };
}

/* PRODUTOS E EMBALAGENS */

function prepararEmbalagens(produto) {
  if (Array.isArray(produto.embalagens) && produto.embalagens.length) {
    return produto.embalagens
      .filter((embalagem) => embalagem && typeof embalagem === "object")
      .map((embalagem, indice) => {
        const informado = embalagem.preco;
        const preco = informado === null || informado === undefined || informado === ""
          ? null
          : Number(informado);

        const precoValido = preco !== null && Number.isFinite(preco) && preco >= 0;

        return {
          id: String(embalagem.id || `embalagem-${indice + 1}`),
          nome: String(embalagem.nome || "Unidade"),
          quantidade: Math.max(1, Number(embalagem.quantidade) || 1),
          preco: precoValido ? preco : null,
          disponivel: precoValido && embalagem.disponivel !== false
        };
      });
  }

  const informado = produto.preco;
  const preco = informado === null || informado === undefined || informado === ""
    ? null
    : Number(informado);
  const valido = preco !== null && Number.isFinite(preco) && preco >= 0;

  return [{
    id: "unidade",
    nome: "Unidade",
    quantidade: 1,
    preco: valido ? preco : null,
    disponivel: valido && produto.disponivel !== false
  }];
}

function validarProdutos(dados) {
  // Aceita tanto {"produtos": [...]} quanto [...].
  const lista = Array.isArray(dados)
    ? dados
    : dados && Array.isArray(dados.produtos)
      ? dados.produtos
      : null;

  if (!lista) {
    throw new Error(
      "Formato inválido no produtos.json: esperado uma lista ou um objeto com a propriedade produtos."
    );
  }

  const ids = new Set();

  return lista.filter((produto) => {
    if (!produto || typeof produto !== "object" || Array.isArray(produto)) {
      return false;
    }

    const id = String(produto.id || "").trim();
    const nome = String(produto.nome || "").trim();

    if (!id || !nome || ids.has(id)) {
      console.warn("Produto ignorado por dados inválidos ou ID repetido:", produto);
      return false;
    }

    ids.add(id);
    return true;
  }).map((produto) => {
    const embalagens = prepararEmbalagens(produto);
    const precoInformado = produto.preco === null ||
      produto.preco === undefined || produto.preco === ""
      ? null
      : Number(produto.preco);

    const precoValido = precoInformado !== null &&
      Number.isFinite(precoInformado) && precoInformado >= 0;

    const precoUnidade = embalagens.find((e) => e.id === "unidade")?.preco;
    const precoEmbalagem = embalagens[0]?.preco;

    return {
      ...produto,
      id: String(produto.id),
      nome: String(produto.nome),
      categoria: String(produto.categoria || "Outros"),
      descricao: String(produto.descricao || ""),
      preco: precoValido ? precoInformado : (precoUnidade ?? precoEmbalagem ?? 0),
      embalagens,
      imagem: String(produto.imagem || ""),
      disponivel: produto.disponivel !== false,
      destaque: produto.destaque === true,
      aumentoEvento: produto.aumentoEvento === null ||
        produto.aumentoEvento === undefined || produto.aumentoEvento === ""
        ? null
        : Number(produto.aumentoEvento)
    };
  });
}

/* PREÇOS */

function obterPrecoEmbalagem(produto, embalagem) {
  if (!embalagem || embalagem.preco === null) return null;
  const original = Number(embalagem.preco);

  if (!Number.isFinite(original)) return null;
  if (!configuracao.modoEvento) return original;

  let percentual = configuracao.aumentoGeralPercentual;

  if (produto.aumentoEvento !== null && Number.isFinite(produto.aumentoEvento)) {
    percentual = Math.max(0, Math.min(500, produto.aumentoEvento));
  }

  return Math.round((original * (1 + percentual / 100) + Number.EPSILON) * 100) / 100;
}

function obterPreco(produto) {
  const unidade = produto.embalagens.find((e) => e.id === "unidade") || produto.embalagens[0];
  return obterPrecoEmbalagem(produto, unidade) ?? produto.preco;
}

function obterProduto(id) {
  return produtos.find((produto) => produto.id === id);
}

function obterEmbalagem(produto, embalagemId) {
  return produto?.embalagens.find((embalagem) => embalagem.id === embalagemId);
}

function criarChaveCarrinho(produtoId, embalagemId) {
  return `${produtoId}::${embalagemId}`;
}

function separarChaveCarrinho(chave) {
  const posicao = chave.lastIndexOf("::");
  if (posicao === -1) {
    return { produtoId: chave, embalagemId: "unidade" };
  }
  return {
    produtoId: chave.slice(0, posicao),
    embalagemId: chave.slice(posicao + 2)
  };
}

function obterQuantidadeCarrinho() {
  let total = 0;
  for (const quantidade of carrinho.values()) total += quantidade;
  return total;
}

function obterSubtotal() {
  let total = 0;
  for (const [chave, quantidade] of carrinho.entries()) {
    const { produtoId, embalagemId } = separarChaveCarrinho(chave);
    const produto = obterProduto(produtoId);
    const embalagem = obterEmbalagem(produto, embalagemId);
    const preco = obterPrecoEmbalagem(produto, embalagem);
    if (preco !== null) total += preco * quantidade;
  }
  return Math.round((total + Number.EPSILON) * 100) / 100;
}

/* CATEGORIAS */

function obterCategorias() {
  const existentes = [...new Set(produtos.map((produto) => produto.categoria))];
  const conhecidas = CATEGORIAS_PADRAO;
  const adicionais = existentes
    .filter((nome) => !CATEGORIAS_PADRAO.some((categoria) => categoria.nome === nome))
    .map((nome) => ({ nome, icone: "outros" }));

  return [...conhecidas, ...adicionais];
}

function renderizarCategorias() {
  if (!elementos.listaCategorias || !elementos.filtro) return;

  const categorias = obterCategorias();

  elementos.listaCategorias.innerHTML = [
    `<button class="categoria-card ${categoriaAtiva === "todas" ? "ativa" : ""}"
      type="button" data-categoria="todas">
      <span class="categoria-icone">${iconeSVG("todas")}</span>
      <strong>Todos os produtos</strong>
    </button>`,
    ...categorias.map((categoria) => `
      <button class="categoria-card ${categoriaAtiva === categoria.nome ? "ativa" : ""}"
        type="button" data-categoria="${escaparHTML(categoria.nome)}">
        <span class="categoria-icone">${iconeCategoria(categoria.nome)}</span>
        <strong>${escaparHTML(categoria.nome)}</strong>
      </button>
    `)
  ].join("");

  elementos.filtro.innerHTML = `
    <option value="todas">Todas as categorias</option>
    ${categorias.map((categoria) => `
      <option value="${escaparHTML(categoria.nome)}">${escaparHTML(categoria.nome)}</option>
    `).join("")}
  `;

  elementos.filtro.value = categoriaAtiva;
}

/* EXIBIÇÃO DOS PRODUTOS */

function produtoCorrespondeFiltro(produto) {
  const texto = [produto.nome, produto.categoria, produto.descricao]
    .join(" ")
    .toLocaleLowerCase("pt-BR");

  return (categoriaAtiva === "todas" || produto.categoria === categoriaAtiva) &&
    texto.includes(buscaAtual.toLocaleLowerCase("pt-BR"));
}

function renderizarProdutos() {
  if (!elementos.gradeProdutos) return;

  const lista = produtos.filter(produtoCorrespondeFiltro);

  if (elementos.quantidadeProdutos) {
    elementos.quantidadeProdutos.textContent =
      `${lista.length} ${lista.length === 1 ? "produto" : "produtos"}`;
  }

  if (elementos.estadoProdutos) {
    elementos.estadoProdutos.hidden = true;
    elementos.estadoProdutos.textContent = "";
  }

  if (lista.length === 0) {
    elementos.gradeProdutos.innerHTML = `
      <div class="estado-vazio">
        <strong>Nenhum produto encontrado</strong>
        <span>Tente outra busca ou escolha outra categoria.</span>
      </div>`;
    return;
  }

  elementos.gradeProdutos.innerHTML = lista.map((produto) => {
    const indisponivel = !produto.disponivel &&
      !configuracao.permitirProdutosIndisponiveisNoCarrinho;

    const selo = !produto.disponivel
      ? '<span class="etiqueta-indisponivel">Indisponível</span>'
      : produto.destaque
        ? '<span class="etiqueta-oferta">Destaque</span>'
        : "";

    const imagem = produto.imagem
      ? `<img src="${escaparHTML(produto.imagem)}"
          alt="${escaparHTML(produto.nome)}" loading="lazy"
          onerror="this.hidden=true;this.nextElementSibling.hidden=false">
         <span class="produto-placeholder" hidden>C</span>`
      : '<span class="produto-placeholder">C</span>';

    const embalagensValidas = produto.embalagens.filter(
      (e) => e.preco !== null && e.disponivel
    );

    const primeiraDisponivel = embalagensValidas[0];
    const precoInicial = primeiraDisponivel
      ? obterPrecoEmbalagem(produto, primeiraDisponivel)
      : null;

    // Mostra o seletor quando o produto tem mais de uma embalagem cadastrada.
    const mostrarSeletor = produto.embalagens.length > 1;

    const opcoesEmbalagem = produto.embalagens.map((embalagem) => {
      const semPreco = embalagem.preco === null;
      const semEstoque = !embalagem.disponivel;
      const desabilitada = semPreco || semEstoque || indisponivel;
      let nome = embalagem.nome;

      if (semPreco) nome += " — preço não cadastrado";
      else if (semEstoque) nome += " — indisponível";

      return `<option value="${escaparHTML(embalagem.id)}"
        ${embalagem.id === primeiraDisponivel?.id ? "selected" : ""}
        ${desabilitada ? "disabled" : ""}>${escaparHTML(nome)}</option>`;
    }).join("");

    return `
      <article class="produto-card">
        <div class="produto-imagem">${selo}${imagem}</div>
        <div class="produto-info">
          <span class="produto-categoria">${escaparHTML(produto.categoria)}</span>
          <h3>${escaparHTML(produto.nome)}</h3>
          <p class="produto-descricao">${escaparHTML(produto.descricao)}</p>

          ${mostrarSeletor ? `
            <label class="produto-embalagem">
              <span>Escolha a embalagem</span>
              <select class="seletor-embalagem"
                data-embalagem-produto="${escaparHTML(produto.id)}"
                ${indisponivel ? "disabled" : ""}>
                ${opcoesEmbalagem}
              </select>
            </label>` : ""}

          <div class="produto-rodape">
            <div class="produto-preco">
              <small>${configuracao.modoEvento ? "Preço de evento" : "Preço"}</small>
              <strong data-preco-produto="${escaparHTML(produto.id)}">
                ${precoInicial === null ? "Preço a consultar" : formatarDinheiro(precoInicial)}
              </strong>
            </div>
            <button type="button" class="botao-adicionar"
              data-adicionar="${escaparHTML(produto.id)}"
              aria-label="Adicionar ${escaparHTML(produto.nome)}"
              ${indisponivel || !primeiraDisponivel ? "disabled" : ""}>+</button>
          </div>
        </div>
      </article>`;
  }).join("");
}

/* SELEÇÃO DE EMBALAGEM */

function atualizarPrecoCard(produtoId, embalagemId) {
  const produto = obterProduto(produtoId);
  const embalagem = obterEmbalagem(produto, embalagemId);

  const precoElemento = document.querySelector(
    `[data-preco-produto="${CSS.escape(produtoId)}"]`
  );
  const botao = document.querySelector(
    `[data-adicionar="${CSS.escape(produtoId)}"]`
  );

  if (!produto || !embalagem || !precoElemento) return;

  const preco = obterPrecoEmbalagem(produto, embalagem);
  const disponivel = produto.disponivel && embalagem.disponivel && preco !== null;

  precoElemento.textContent = preco === null ? "Preço a consultar" : formatarDinheiro(preco);

  if (botao) {
    botao.disabled = !disponivel;
    botao.setAttribute("aria-label", `Adicionar ${produto.nome} — ${embalagem.nome}`);
  }
}

function adicionarProduto(produtoId, embalagemId) {
  const produto = obterProduto(produtoId);
  const embalagem = obterEmbalagem(produto, embalagemId);
  if (!produto || !embalagem) return;

  if (!produto.disponivel && !configuracao.permitirProdutosIndisponiveisNoCarrinho) {
    notificar("Este produto está indisponível.");
    return;
  }

  const preco = obterPrecoEmbalagem(produto, embalagem);
  if (preco === null || !embalagem.disponivel) {
    notificar("Cadastre o preço desta embalagem antes de adicioná-la.");
    return;
  }

  const chave = criarChaveCarrinho(produtoId, embalagemId);
  carrinho.set(chave, (carrinho.get(chave) || 0) + 1);
  renderizarCarrinho();
  notificar(`${produto.nome} — ${embalagem.nome} adicionado ao pedido.`);
}

function alterarQuantidade(chave, delta) {
  const nova = (carrinho.get(chave) || 0) + delta;
  if (nova <= 0) carrinho.delete(chave);
  else carrinho.set(chave, nova);
  renderizarCarrinho();
}

function removerProduto(chave) {
  carrinho.delete(chave);
  renderizarCarrinho();
  notificar("Item removido do pedido.");
}

/* CARRINHO */

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
        <h3>Seu carrinho está vazio</h3>
        <p>Adicione produtos para montar seu pedido.</p>
      </div>`;
    return;
  }

  elementos.itensCarrinho.innerHTML = [...carrinho.entries()]
    .map(([chave, quantidade]) => {
      const { produtoId, embalagemId } = separarChaveCarrinho(chave);
      const produto = obterProduto(produtoId);
      const embalagem = obterEmbalagem(produto, embalagemId);
      if (!produto || !embalagem) return "";

      const preco = obterPrecoEmbalagem(produto, embalagem);
      if (preco === null) return "";

      return `
        <article class="item-carrinho">
          <div>
            <h3>${escaparHTML(produto.nome)}</h3>
            <p>${escaparHTML(embalagem.nome)}</p>
            <div class="item-carrinho-preco">${formatarDinheiro(preco * quantidade)}</div>
            <div class="item-carrinho-controles">
              <button type="button" class="botao-quantidade"
                data-diminuir="${escaparHTML(chave)}"
                aria-label="Diminuir quantidade">−</button>
              <span>${quantidade}</span>
              <button type="button" class="botao-quantidade"
                data-aumentar="${escaparHTML(chave)}"
                aria-label="Aumentar quantidade">+</button>
            </div>
          </div>
          <button type="button" class="botao-remover"
            data-remover="${escaparHTML(chave)}">Remover</button>
        </article>`;
    }).join("");
}

/* PAINEL DO CARRINHO */

function abrirCarrinho() {
  elementos.painelCarrinho?.classList.add("aberto");
  elementos.painelCarrinho?.setAttribute("aria-hidden", "false");
  elementos.painelCarrinho?.removeAttribute("inert");
  if (elementos.fundoModal) elementos.fundoModal.hidden = false;
  document.body.classList.add("modal-aberto");
  elementos.fecharCarrinho?.focus();
}

function fecharCarrinho() {
  elementos.painelCarrinho?.classList.remove("aberto");
  elementos.painelCarrinho?.setAttribute("aria-hidden", "true");
  elementos.painelCarrinho?.setAttribute("inert", "");
  if (elementos.fundoModal) elementos.fundoModal.hidden = true;
  document.body.classList.remove("modal-aberto");
}

/* FINALIZAÇÃO PELO WHATSAPP */

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

  for (const [chave, quantidade] of carrinho.entries()) {
    const { produtoId, embalagemId } = separarChaveCarrinho(chave);
    const produto = obterProduto(produtoId);
    const embalagem = obterEmbalagem(produto, embalagemId);
    if (!produto || !embalagem) continue;

    if (!produto.disponivel && !configuracao.permitirProdutosIndisponiveisNoCarrinho) {
      notificar(`Confira a disponibilidade de ${produto.nome}.`);
      return;
    }

    if (!embalagem.disponivel) {
      notificar(`A embalagem ${embalagem.nome} está indisponível.`);
      return;
    }

    const preco = obterPrecoEmbalagem(produto, embalagem);
    if (preco === null) {
      notificar(`O preço de ${produto.nome} — ${embalagem.nome} precisa ser cadastrado.`);
      return;
    }

    linhas.push(
      `${quantidade}x ${produto.nome} (${embalagem.nome}) — ${formatarDinheiro(preco * quantidade)}`
    );
  }

  linhas.push("");
  linhas.push(`Subtotal: ${formatarDinheiro(obterSubtotal())}`);

  if (configuracao.modoEvento) {
    linhas.push("Pedido durante período de evento.");
  }

  linhas.push("");
  linhas.push("Por favor, confirme a disponibilidade, entrega e pagamento.");

  const url = `https://wa.me/${configuracao.whatsapp}?text=` +
    encodeURIComponent(linhas.join("\n"));

  window.open(url, "_blank", "noopener,noreferrer");
}

/* ATUALIZAÇÃO DA CONFIGURAÇÃO */

async function atualizarConfiguracao() {
  try {
    const nova = validarConfiguracao(await buscarJSON(ARQUIVOS.config));
    const mudou = JSON.stringify(nova) !== JSON.stringify(configuracao);
    configuracao = nova;

    if (elementos.avisoEvento) {
      elementos.avisoEvento.hidden = !configuracao.modoEvento;
      const texto = $("#texto-aviso-evento");
      if (texto && configuracao.modoEvento) {
        texto.textContent = configuracao.mensagemEvento;
      }
    }

    if (elementos.linkWhatsappRodape) {
      elementos.linkWhatsappRodape.href = configuracao.whatsapp
        ? `https://wa.me/${configuracao.whatsapp}`
        : "#contato";
    }

    const endereco = $("#endereco-rodape");
    if (endereco && configuracao.endereco) {
      endereco.textContent = configuracao.endereco;
    }

    if (mudou) {
      renderizarProdutos();
      renderizarCarrinho();
    }

    return true;
  } catch (erro) {
    console.error("Erro ao atualizar configuração:", erro);
    return false;
  }
}

/* ATUALIZAÇÃO DOS PRODUTOS */

async function atualizarProdutos() {
  try {
    produtos = validarProdutos(await buscarJSON(ARQUIVOS.produtos));

    for (const chave of carrinho.keys()) {
      const { produtoId, embalagemId } = separarChaveCarrinho(chave);
      const produto = obterProduto(produtoId);
      const embalagem = obterEmbalagem(produto, embalagemId);

      const indisponivel = produto &&
        !produto.disponivel &&
        !configuracao.permitirProdutosIndisponiveisNoCarrinho;

      if (
        !produto ||
        !embalagem ||
        embalagem.preco === null ||
        !embalagem.disponivel ||
        indisponivel
      ) {
        carrinho.delete(chave);
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

    // Mesmo se o JSON falhar, mantém as categorias visíveis.
    renderizarCategorias();

    if (elementos.gradeProdutos) {
      elementos.gradeProdutos.innerHTML = `
        <div class="estado-vazio">
          <strong>Não foi possível carregar os produtos</strong>
          <span>Verifique o arquivo produtos.json e tente novamente.</span>
        </div>`;
    }

    if (elementos.quantidadeProdutos) {
      elementos.quantidadeProdutos.textContent = "0 produtos";
    }

    if (elementos.estadoProdutos) {
      elementos.estadoProdutos.hidden = false;
      elementos.estadoProdutos.textContent =
        "Não foi possível carregar os produtos. Verifique o arquivo produtos.json.";
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

/* EVENTOS DA PÁGINA */

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

  elementos.gradeProdutos?.addEventListener("change", (evento) => {
    const seletor = evento.target.closest("[data-embalagem-produto]");
    if (!seletor) return;
    atualizarPrecoCard(seletor.dataset.embalagemProduto, seletor.value);
  });

  elementos.gradeProdutos?.addEventListener("click", (evento) => {
    const botao = evento.target.closest("[data-adicionar]");
    if (!botao) return;

    const produtoId = botao.dataset.adicionar;
    const produto = obterProduto(produtoId);
    if (!produto) return;

    const seletor = elementos.gradeProdutos.querySelector(
      `[data-embalagem-produto="${CSS.escape(produtoId)}"]`
    );

    const embalagemId = seletor
      ? seletor.value
      : produto.embalagens.find((embalagem) =>
          embalagem.preco !== null && embalagem.disponivel
        )?.id;

    if (!embalagemId) {
      notificar("Nenhuma embalagem com preço disponível.");
      return;
    }

    adicionarProduto(produtoId, embalagemId);
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

  $("#abrir-carrinho-contato")?.addEventListener("click", abrirCarrinho);

  document.addEventListener("keydown", (evento) => {
    if (evento.key === "Escape") fecharCarrinho();
  });

  if (elementos.anoAtual) {
    elementos.anoAtual.textContent = new Date().getFullYear();
  }
}

/* INICIALIZAÇÃO */

async function iniciarSite() {
  configurarEventos();

  // Carrega os produtos mesmo se config.json estiver com erro.
  await atualizarConfiguracao();
  await atualizarProdutos();

  renderizarCategorias();
  renderizarProdutos();
  renderizarCarrinho();

  iniciarAtualizacaoAutomatica();
}

iniciarSite();
