# Salas de Jogo

App para a aula com dois modos:

- **Eliminatória:** uma pergunta de cada vez, com tempo. Quem erra sai. Ganha o último.
- **Prova cronometrada:** todas as perguntas ao mesmo tempo. Fecha quando o tempo acabar.

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
5. Cria a sala e projeta o ecrã. Os alunos leem o QR ou escrevem o endereço e o código de 4 algarismos.

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

## Resultados

Cada jogo, ao terminar, grava um CSV na pasta `resultados` (abre no Excel). Também podes descarregá-lo no painel.

## Limites desta versão

- Os dados vivem na memória do computador. Se fechares a janela do servidor a meio, a sala perde-se (os CSV já gravados ficam).
- Testado com dezenas de alunos ao mesmo tempo, numa rede local.
- O QR precisa de internet para aparecer. Sem internet, os alunos escrevem o endereço.
