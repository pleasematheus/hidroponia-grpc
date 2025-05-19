import * as grpc from "@grpc/grpc-js"
import * as protoLoader from "@grpc/proto-loader"
import * as path from "path"
import * as readline from "readline"

// Configurações básicas
const PROTOS_DIR = path.join(__dirname, "../protos")
const PORTA_PADRAO_SERVIDOR_CALCULO = "8060"
// Endereço do servidor será configurado pelo usuário
let ENDERECO_SERVIDOR_CALCULO = ""

// Interface para entrada de usuário
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
})

// Carrega os serviços gRPC
const bancadaProtoPath = path.join(PROTOS_DIR, "bancada.proto")
const bancadaPackageDef = protoLoader.loadSync(bancadaProtoPath, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
})
const bancadaDescriptor = grpc.loadPackageDefinition(bancadaPackageDef) as any
const BancoClient = bancadaDescriptor.bancada.BancadaService

const calculoProtoPath = path.join(PROTOS_DIR, "calculo.proto")
const calculoPackageDef = protoLoader.loadSync(calculoProtoPath, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
})
const calculoDescriptor = grpc.loadPackageDefinition(calculoPackageDef) as any
const CalculoClient = calculoDescriptor.calculo.CalculoService

// Estrutura básica de bancadas
interface BancadaInfo {
  id: number
  endereco: string
  cliente: any
  conectada: boolean
}

// Interfaces para os tipos de dados
interface DadoSensor {
  bancada_id: string
  temperatura: number
  umidade: number
  condutividade: number
  timestamp: string
}

// Lista de bancadas e dados
const bancadas: BancadaInfo[] = []
let calculoClient: any = null
const dadosArmazenados: DadoSensor[] = []

// Função para iniciar o cliente MVP
async function iniciar() {
  // Configurar o servidor de cálculo primeiro
  await configurarServidorCalculo()

  while (true) {
    console.clear()
    console.log("\n=== SISTEMA DE HIDROPONIA - MVP ===")
    console.log(
      `Bancadas conectadas: ${bancadas.length} | Dados coletados: ${dadosArmazenados.length}`
    )
    console.log(
      `Servidor de cálculo: ${ENDERECO_SERVIDOR_CALCULO || "Não configurado"}`
    )
    console.log("1. Conectar a uma bancada")
    console.log("2. Coletar dados das bancadas")
    console.log("3. Calcular métricas")
    console.log("4. Exibir dados coletados")
    console.log("5. Reconfigurar servidor de cálculo")
    console.log("0. Sair")

    const opcao = await pergunta("\nEscolha uma opção: ")

    switch (opcao) {
      case "1": // Conectar bancada
        await conectarBancada()
        break
      case "2": // Coletar dados
        await coletarDados()
        break
      case "3": // Calcular métricas
        await calcularMetricasDados()
        break
      case "4": // Exibir dados
        await exibirDados()
        break
      case "5": // Reconfigurar servidor de cálculo
        await configurarServidorCalculo()
        break
      case "0": // Sair
        console.log("Encerrando o sistema...")
        rl.close()
        process.exit(0)
        break
      default:
        console.log("Opção inválida!")
        await aguardarTecla()
    }
  }
}

// Função para configurar o servidor de cálculo
async function configurarServidorCalculo() {
  console.log("\n=== CONFIGURAÇÃO DO SERVIDOR DE CÁLCULO ===")
  console.log("Informe o endereço do servidor de cálculo")
  console.log("(exemplo: localhost:8060 ou 192.168.1.100:8060)")

  const endereco = await pergunta("Endereço IP ou hostname: ")
  let porta = await pergunta(`Porta [${PORTA_PADRAO_SERVIDOR_CALCULO}]: `)

  // Se não informou porta, usa a padrão
  if (!porta) porta = PORTA_PADRAO_SERVIDOR_CALCULO

  ENDERECO_SERVIDOR_CALCULO = `${endereco}:${porta}`

  console.log(
    `\nConfigurando conexão com servidor de cálculo em ${ENDERECO_SERVIDOR_CALCULO}...`
  )
  calculoClient = new CalculoClient(
    ENDERECO_SERVIDOR_CALCULO,
    grpc.credentials.createInsecure()
  )

  try {
    // Testa a conexão
    const conectado = await testarConexao(
      "calculo",
      calculoClient,
      ENDERECO_SERVIDOR_CALCULO
    )

    if (conectado) {
      console.log("Conexão estabelecida com sucesso!")
    } else {
      console.error(
        `Não foi possível conectar ao servidor de cálculo em ${ENDERECO_SERVIDOR_CALCULO}`
      )
      console.log(
        "O sistema continuará funcionando, mas não será possível calcular métricas."
      )
      console.log("Você pode reconfigurar o servidor de cálculo mais tarde.")
    }
  } catch (erro: any) {
    console.error(`Erro ao criar cliente: ${erro.message || erro}`)
  }

  await aguardarTecla()
}

// Função para conectar a uma bancada
async function conectarBancada() {
  console.log("\n=== CONECTAR A UMA BANCADA ===")
  console.log("Informe o endereço IP ou hostname da bancada")
  console.log("(exemplo: localhost ou 192.168.1.100)")
  const endereco = await pergunta("Endereço IP ou hostname: ")
  const porta = await pergunta("Porta da bancada: ")
  const enderecoCompleto = `${endereco}:${porta}`

  try {
    console.log(`\nConectando à bancada em ${enderecoCompleto}...`)
    const cliente = new BancoClient(
      enderecoCompleto,
      grpc.credentials.createInsecure()
    )

    // Testa a conexão
    const conectado = await testarConexao("bancada", cliente, enderecoCompleto)

    if (conectado) {
      console.log("Conexão estabelecida com sucesso!")

      // Adiciona a bancada à lista
      const novaBancada: BancadaInfo = {
        id: bancadas.length + 1,
        endereco: enderecoCompleto,
        cliente: cliente,
        conectada: true,
      }
      bancadas.push(novaBancada)
      console.log(`Bancada #${novaBancada.id} adicionada.`)
    } else {
      console.error(
        `Não foi possível conectar à bancada em ${enderecoCompleto}`
      )
    }
  } catch (erro: any) {
    console.error(`Erro ao criar cliente: ${erro.message || erro}`)
  }

  await aguardarTecla()
}

// Função para coletar dados das bancadas
async function coletarDados() {
  if (bancadas.length === 0) {
    console.log(
      "\nNenhuma bancada conectada. Conecte-se a uma bancada primeiro."
    )
    await aguardarTecla()
    return
  }

  console.log("\nColetando dados de todas as bancadas conectadas...")
  let sucessos = 0
  let falhas = 0
  const timeout = 5000 // 5 segundos de timeout para cada bancada

  for (const bancada of bancadas) {
    try {
      console.log(
        `Coletando da bancada #${bancada.id} (${bancada.endereco})...`
      )

      const dadosPromise = new Promise<DadoSensor>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error(`Tempo limite excedido (${timeout / 1000}s)`))
        }, timeout)

        enviarDados(bancada.cliente)({})
          .then((dados) => {
            clearTimeout(timeoutId)
            resolve(dados)
          })
          .catch((erro) => {
            clearTimeout(timeoutId)
            reject(erro)
          })
      })

      const dados = await dadosPromise
      console.log(
        `> Recebido: Temperatura=${dados.temperatura}°C, Umidade=${dados.umidade}%, Condutividade=${dados.condutividade}`
      )
      dadosArmazenados.push(dados)
      bancada.conectada = true
      sucessos++
    } catch (erro: any) {
      console.error(
        `Erro ao coletar dados da bancada #${bancada.id}: ${
          erro.message || erro
        }`
      )
      bancada.conectada = false
      falhas++
    }
  }

  console.log(
    `\nColeta concluída: ${sucessos} de ${bancadas.length} bancadas responderam com sucesso.`
  )
  if (falhas > 0) {
    console.log(`${falhas} bancada(s) não respondeu(ram) corretamente.`)
  }
  await aguardarTecla()
}

// Função para calcular métricas
async function calcularMetricasDados() {
  if (dadosArmazenados.length === 0) {
    console.log("\nNenhum dado disponível. Colete dados primeiro.")
    await aguardarTecla()
    return
  }

  if (!ENDERECO_SERVIDOR_CALCULO || !calculoClient) {
    console.log("\nServidor de cálculo não configurado. Configure-o primeiro.")
    await aguardarTecla()
    return
  }

  console.log("\nEnviando dados para cálculo de métricas...")
  try {
    // Primeiro verifica a conexão com o servidor de cálculo
    const conectado = await testarConexao(
      "calculo",
      calculoClient,
      ENDERECO_SERVIDOR_CALCULO
    )

    if (!conectado) {
      console.error(
        `Não foi possível conectar ao servidor de cálculo em ${ENDERECO_SERVIDOR_CALCULO}`
      )
      await aguardarTecla()
      return
    }

    const request = { dados: dadosArmazenados }
    const response = await calcularMetricas(request)

    console.log("\nResultado das métricas:")
    console.table(response.metricas)
  } catch (erro: any) {
    console.error(`Erro ao calcular métricas: ${erro.message || erro}`)
  }

  await aguardarTecla()
}

// Função para testar o servidor de cálculo
async function testarServidorCalculo() {
  if (!ENDERECO_SERVIDOR_CALCULO) {
    console.log("\nServidor de cálculo não configurado. Configure-o primeiro.")
    await aguardarTecla()
    return
  }

  console.log(
    `\nTestando conexão com servidor de cálculo em ${ENDERECO_SERVIDOR_CALCULO}...`
  )

  const conectado = await testarConexao(
    "calculo",
    calculoClient,
    ENDERECO_SERVIDOR_CALCULO
  )

  if (conectado) {
    console.log(`Conexão estabelecida com sucesso ao servidor de cálculo!`)
  } else {
    console.error(
      `Não foi possível conectar ao servidor de cálculo em ${ENDERECO_SERVIDOR_CALCULO}`
    )
  }

  await aguardarTecla()
}

// Função para exibir dados coletados
async function exibirDados() {
  if (dadosArmazenados.length === 0) {
    console.log("\nNenhum dado coletado ainda.")
  } else {
    console.log("\nDados coletados:")
    console.table(dadosArmazenados)
  }

  await aguardarTecla()
}

// Função auxiliar para prompts
function pergunta(texto: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(texto, (answer) => {
      resolve(answer)
    })
  })
}

// Espera o usuário pressionar ENTER para continuar
function aguardarTecla(): Promise<void> {
  return new Promise((resolve) => {
    rl.question("\nPressione ENTER para continuar...", () => resolve())
  })
}

async function testarConexao(
  tipo: "bancada" | "calculo",
  cliente: any,
  endereco: string
): Promise<boolean> {
  return new Promise((resolve) => {
    console.log(`Testando conexão com ${tipo} em ${endereco}...`)

    // Timeout para cancelar a conexão após um curto período
    const timeoutId = setTimeout(() => {
      console.log(
        `Tempo limite excedido ao tentar conectar em ${endereco}. Verifique se o servidor está rodando.`
      )
      resolve(false)
    }, 3000)

    try {
      // Determina qual método chamar com base no tipo de serviço
      if (tipo === "bancada") {
        // Para bancadas, enviamos uma solicitação vazia para o método EnviarDados
        cliente.EnviarDados({}, (err: Error | null) => {
          clearTimeout(timeoutId)
          if (err) {
            console.log(`Erro ao conectar à bancada: ${err.message}`)
            if (err.message.includes("UNAVAILABLE")) {
              console.log(
                `Servidor em ${endereco} não está disponível ou não está rodando.`
              )
            }
            resolve(false)
          } else {
            console.log(
              `Conexão com bancada em ${endereco} estabelecida com sucesso.`
            )
            resolve(true)
          }
        })
      } else {
        // Para o servidor de cálculo, enviamos um array vazio para CalcularMetricas
        const requestVazio = { dados: [] }
        cliente.CalcularMetricas(requestVazio, (err: Error | null) => {
          clearTimeout(timeoutId)
          if (err) {
            console.log(
              `Erro ao conectar ao servidor de cálculo: ${err.message}`
            )
            if (err.message.includes("UNAVAILABLE")) {
              console.log(
                `Servidor de cálculo em ${endereco} não está disponível ou não está rodando.`
              )
            }
            resolve(false)
          } else {
            console.log(
              `Conexão com servidor de cálculo em ${endereco} estabelecida com sucesso.`
            )
            resolve(true)
          }
        })
      }
    } catch (err) {
      clearTimeout(timeoutId)
      console.log(`Erro inesperado ao tentar conectar: ${err}`)
      resolve(false)
    }
  })
}

// Wrappers gRPC com promises
const enviarDados =
  (client: any) =>
  (request: any): Promise<DadoSensor> => {
    return new Promise((resolve, reject) => {
      client.EnviarDados(
        request || {},
        (err: Error | null, response: DadoSensor) => {
          if (err) reject(err)
          else resolve(response)
        }
      )
    })
  }

const calcularMetricas = (request: any): Promise<any> => {
  return new Promise((resolve, reject) => {
    calculoClient.CalcularMetricas(
      request,
      (err: Error | null, response: any) => {
        if (err) reject(err)
        else resolve(response)
      }
    )
  })
}

// Inicia o sistema
iniciar().catch((erro) => {
  console.error("Erro fatal no sistema:", erro)
  process.exit(1)
})
