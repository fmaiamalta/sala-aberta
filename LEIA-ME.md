# Sala Aberta

App para a aula com dois modos:

- **Jogo de perguntas:** uma pergunta de cada vez, com tempo. Quem erra sai. Ganha o último.
- **Teste com tempo:** todas as perguntas ao mesmo tempo. Fecha quando o tempo acabar e dá nota.
- **Percurso na sala:** em cada grupo, um aluno guia (com o aparelho) e outro caminha até às estações. Serve para a motherboard, para os caminhos marítimos ou para qualquer mapa ou esquema.

Funciona no teu computador. Os alunos entram pelo browser, no telemóvel ou nos computadores da sala. Não precisam de instalar nada.

## Instalar (uma vez)

1. Instala o Node.js (versão LTS) em https://nodejs.org
2. Descompacta esta pasta onde quiseres.

## Usar numa aula

1. Liga o computador à mesma rede Wi-Fi dos alunos.
2. Abre a app:
   - Windows: duplo clique em `iniciar-windows.bat`
   - Mac: duplo clique em `iniciar-mac.command` (da primeira vez: botão direito, Abrir)
3. A janela mostra o **PIN do professor** e o endereço para os alunos, por exemplo `http://192.168.1.23:3000`.
4. No teu browser abre `http://localhost:3000/professor` e escreve o PIN.
5. Escolhe o que queres fazer (Jogo de perguntas, Teste com tempo ou Percurso na sala) e segue os passos. As opções menos usadas estão em "Mais opções". Os alunos leem o QR ou escrevem o endereço e o código de 4 algarismos.

Se o Windows perguntar se permite o acesso à rede, escolhe **Permitir** (redes privadas). Sem isto, os alunos não conseguem entrar.

Para teres sempre o mesmo PIN, abre o ficheiro de arranque num editor de texto e acrescenta uma linha antes de `node server.js`:

- Windows (`iniciar-windows.bat`, no Bloco de Notas): `set PIN=2580`
- Mac (`iniciar-mac.command`, no TextEdit): `export PIN=2580`

## Perguntas

Uma pergunta por linha, separada por ponto e vírgula:

    pergunta;resposta;segundos;opções

- **segundos** é opcional (60 por defeito).
- **opções** é opcional. Se existir, o aluno escolhe de uma lista. Separa-as com `|`.
- Várias respostas aceites: `3/4|0,75`.
- Os números são comparados como números: `0,5`, `0.5` e `1/2` contam igual.
- Maiúsculas e acentos não contam: `astrolabio` é igual a `Astrolábio`.

Podes preparar as perguntas no Excel com 4 colunas e colar na caixa de texto, ou gravar como CSV e carregar o ficheiro. Na pasta `exemplos` tens 4 conjuntos prontos (Matemática 5.º e 12.º, História, Informática).

## Regras da eliminatória

- A ronda fecha quando o tempo acaba ou quando todos responderam.
- Se ninguém acertar, ninguém sai.
- Podes dar 1, 2, 3 ou 5 vidas.
- Opção "eliminados continuam a responder": treinam, mas não contam para o vencedor.
- Se as perguntas acabarem com mais de um aluno em jogo, ganha quem acertou mais. Em empate, quem respondeu mais depressa.

## Percurso

**Preparar**
1. Em "Nova sala", escolhe **Percurso**.
2. Escolhe um mapa: um dos exemplos (Motherboard, Descobrimentos) ou uma imagem tua (foto do quadro, mapa, esquema).
3. Clica no mapa para marcar as estações e dá-lhes nomes. Clica numa estação para mudar o nome ou a apagar.
4. Escreve as missões, uma por linha: `Vasco da Gama, 1497: Lisboa > Cabo Verde > Cabo da Boa Esperança > Calecute`. A primeira estação é o ponto de partida.
5. Escolhe quantos grupos vão jogar (2 a 8). Cada grupo tem uma cor.
6. Abre a sala e carrega em **Imprimir cartões**. Sai um cartão por estação, com um código diferente para cada cor.

**Os cartões**
- Recorta, dobra cada cartão para trás pela linha do meio (o nome fica à frente, os códigos atrás) e cola só pela parte de cima: em cima do mapa projetado, ou na mesa do grupo que faz de componente.
- O caminhante levanta o cartão e lê só a linha da sua cor.
- Os códigos são novos em cada sala. Se um grupo ouvir o código de outro, não lhe serve.

**Jogar**
- Cada grupo entra com um aparelho (o do navegador). O caminhante não leva nada.
- O navegador vê o destino e guia o colega por palavras. Quando o colega volta com o código, o navegador escreve-o.
- Código certo: o grupo avança. Código de outra estação: espera 15 segundos. Código de outra cor ou que não existe: espera 5 segundos.
- No fim de cada missão, os dois trocam de papéis. Cada grupo começa numa missão diferente, para não irem todos à mesma estação.
- **Projetar no quadro** abre um ecrã com o mapa, os pontos dos grupos a andar e a classificação. Não mostra códigos. No canto há um botão para esconder os nomes das estações.

O controlo da vez também funciona aqui: um grupo fechado não consegue enviar códigos.

## Dar a vez (postos)

Cada aluno, ou grupo, tem no painel um botão **Aberto/Fechado**:

- **Aberto:** pode responder.
- **Fechado:** vê "Aguarda a tua vez" e não consegue responder. Na eliminatória vê a pergunta; na prova não vê as perguntas, mas as respostas que já deu ficam guardadas.
- **Só este:** dá a vez a esse aluno e fecha todos os outros. Por exemplo, "só o grupo 5 responde".
- **Abrir todos / Fechar todos:** para toda a turma de uma vez.
- **Nome:** clica no nome de um aluno para lhe chamar, por exemplo, "Grupo 5 – Entradas".

Ao criar a sala, a opção "Os alunos entram fechados" faz com que ninguém responda até lhe dares a vez. Sem ela, todos entram abertos.

Na eliminatória, quem não teve a vez numa ronda não perde vidas nessa ronda. A ronda fecha sozinha quando todos os que têm a vez responderam.

## Avaliação

Quando a prova (ou o jogo) termina, aparece no painel o quadro **Avaliação**:

- **Escala:** níveis 1 a 5 (5.º ao 9.º ano) ou 0 a 20 valores (10.º ao 12.º ano).
- **Níveis:** defines a percentagem mínima de cada nível. Por defeito: 2 a partir de 20%, 3 a partir de 50%, 4 a partir de 70%, 5 a partir de 90%. Ajusta aos critérios da tua escola.
- **0 a 20:** a nota é a percentagem a dividir por 5, com uma casa decimal (75% dá 15,0).
- **Menções:** por defeito, Insuficiente (0 a 49%), Suficiente (50 a 69%), Bom (70 a 89%) e Muito Bom (90 a 100%). Podes mudar os limites, os nomes, juntar ou tirar menções (por exemplo, Fraco abaixo de 20%). Se escreveres uma nota à mão, a menção acompanha essa nota.
- **Perfis de critérios:** carrega em "Guardar como perfil" e dá-lhe um nome, por exemplo "Critérios 3.º ciclo". O perfil guarda a escala, os níveis e as menções. Ao criar uma sala, escolhes o perfil numa lista. Os perfis ficam guardados no browser onde os criaste: se mudares de computador, tens de os criar outra vez.
- **Cotações:** cada pergunta vale 1 ponto por defeito. Podes mudar.
- **Correções:** clica numa resposta para a marcar como certa ou errada. Útil quando o aluno escreve uma resposta certa de outra forma.
- **Nota manual:** escreve por cima da nota calculada. Apaga o valor para voltar à calculada.

O CSV descarregado inclui a nota, a menção, a percentagem e os pontos de cada aluno, e uma linha final com as respostas certas.

Na eliminatória, as perguntas a que um aluno eliminado já não respondeu contam como erradas. Para avaliar, usa a prova cronometrada.

## Resultados

Cada jogo, ao terminar, grava um CSV na pasta `resultados` (abre no Excel). Também podes descarregá-lo no painel.

## Limites desta versão

- Os dados vivem na memória do computador. Se fechares a janela do servidor a meio, a sala perde-se (os CSV já gravados ficam).
- Testado com dezenas de alunos ao mesmo tempo, numa rede local.
- O QR precisa de internet para aparecer. Sem internet, os alunos escrevem o endereço.

## Pôr online (com o teu domínio)

O GitHub guarda o código, mas não corre a app. Precisas de um alojamento que corra Node.js. Estas instruções usam o Render (render.com), que lê o código diretamente do GitHub.

1. Cria conta em render.com com a tua conta GitHub.
2. **New → Blueprint** e escolhe este repositório. O ficheiro `render.yaml` já tem a configuração.
3. Preenche as duas variáveis:
   - `PIN`: uma palavra-passe com pelo menos 8 caracteres. Os alunos vão estar na mesma rede que tu, não uses uma fácil.
   - `PUBLIC_URL`: o endereço final, por exemplo `https://sala.teudominio.pt`
4. No serviço criado, vai a **Settings → Custom Domains** e junta `sala.teudominio.pt`.
5. No sítio onde compraste o domínio, cria o registo DNS que o Render indicar (normalmente um `CNAME` de `sala` para `sala-aberta.onrender.com`). O certificado HTTPS é criado sozinho.

Notas:
- O `render.yaml` começa no plano gratuito. Esse plano adormece a app após 15 minutos sem uso e apaga as salas em memória. Para usar em aula, muda para o plano Starter (cerca de 7 dólares por mês) em **Settings → Instance Type**. Fica sempre ligado.
- Online, os CSV da pasta `resultados` não ficam guardados de forma permanente. Descarrega os resultados no painel no fim de cada jogo.
- Sempre que fizeres alterações no GitHub, o Render atualiza a app sozinho. Não o faças durante uma aula: a atualização reinicia o servidor e as salas abertas perdem-se.
