import {
  PublicApiError,
  PublicElectionApiClient,
  VerificationApiClient,
  VotingApiClient,
  type CastVoteResponse,
} from '../api/public-clients.js';
import {
  createCredential,
  parseCredential,
  serializeCredential,
  type VoterCredentialV1,
} from '../credential/credential.js';
import type { ElectionManifestEnvelope } from '../election/manifest.js';
import {
  parseEligibilityMaterial,
  type EligibilityMaterialV1,
} from '../proof/protocol/eligibility-material.js';
import { ProofWorkerClient, type GeneratedProof } from '../proof/worker/client.js';
import { transitionSubmission, type SubmissionState } from '../voting/submission-machine.js';

const PROTOCOL_VERSION_V1 = 'anonymous-single-choice-v1';

const node = <K extends keyof HTMLElementTagNameMap>(
  name: K,
  className?: string,
  text?: string,
) => {
  const item = document.createElement(name);
  if (className) item.className = className;
  if (text !== undefined) item.textContent = text;
  return item;
};
const button = (text: string, className = 'primary') => {
  const item = node('button', className, text);
  item.type = 'button';
  return item;
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function download(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function readFile(input: HTMLInputElement): Promise<string> {
  const file = input.files?.[0];
  if (!file || file.size > 128 * 1024) throw new Error('El archivo falta o excede 128 KiB.');
  return file.text();
}

export class VoterApp {
  private readonly electionApi: PublicElectionApiClient;
  private readonly votingApi: VotingApiClient;
  private readonly verificationApi: VerificationApiClient;
  private readonly worker = new ProofWorkerClient();
  private manifest: ElectionManifestEnvelope | undefined;
  private credential: VoterCredentialV1 | undefined;
  private eligibility: EligibilityMaterialV1 | undefined;
  private generated: GeneratedProof | undefined;
  private receipt: CastVoteResponse | undefined;
  private selectedEncoding: number | undefined;
  private state: SubmissionState = 'READY';
  private readonly status = node('p', 'status', 'Carga una elección para comenzar.');
  private readonly content = node('div', 'flow');

  constructor(
    private readonly root: HTMLElement,
    baseUrl: string,
    private readonly artifactBaseUrl: string,
  ) {
    this.electionApi = new PublicElectionApiClient(baseUrl);
    this.votingApi = new VotingApiClient(baseUrl);
    this.verificationApi = new VerificationApiClient(baseUrl);
  }

  start(): void {
    this.status.setAttribute('role', 'status');
    this.status.setAttribute('aria-live', 'polite');
    const header = node('header', 'site-header');
    const brand = node('a', 'brand');
    brand.href = '#';
    brand.append(node('span', 'brand-mark', 'V'), node('strong', '', 'Votaciones'));
    const privacy = node('span', 'privacy-pill', 'Sin cookies administrativas · sin trackers');
    header.append(brand, privacy);
    const main = node('main', 'main');
    main.id = 'main';
    const hero = node('section', 'hero');
    hero.append(
      node('p', 'eyebrow', 'Portal privado de votación'),
      node('h1', '', 'Tu secreto permanece contigo.'),
      node(
        'p',
        'lede',
        'Genera la prueba en este navegador, envía sólo señales públicas y conserva un receipt para verificar la inclusión. La privacidad reduce correlaciones, pero no promete anonimato absoluto.',
      ),
    );
    main.append(hero, this.status, this.content);
    this.root.append(header, main);
    this.renderElectionLoader();
  }

  private renderElectionLoader(): void {
    this.content.replaceChildren();
    const panel = node('section', 'panel');
    const heading = node('h2', '', '1. Abrir elección');
    const form = node('form', 'inline-form');
    const input = node('input');
    input.placeholder = 'UUID de la elección';
    input.required = true;
    input.setAttribute('aria-label', 'Identificador de elección');
    const submit = button('Validar manifest');
    submit.type = 'submit';
    form.append(input, submit);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!UUID.test(input.value)) {
        this.setStatus('El UUID de elección no es válido.', true);
        return;
      }
      submit.disabled = true;
      this.setStatus('Validando manifest, protocolo y digests…');
      void this.electionApi
        .manifest(input.value)
        .then((manifest) => {
          this.manifest = manifest;
          this.setStatus('Manifest electoral verificado.');
          this.renderFlow();
        })
        .catch((error: unknown) => this.setStatus(this.message(error), true))
        .finally(() => {
          submit.disabled = false;
        });
    });
    panel.append(
      heading,
      node(
        'p',
        '',
        'El reloj local es informativo; el servidor decide si la elección está abierta.',
      ),
      form,
    );
    this.content.append(panel, this.renderVerificationPanel());
  }

  private renderFlow(): void {
    const manifest = this.manifest;
    if (!manifest) return;
    this.content.replaceChildren();
    const summary = node('section', 'panel election-summary');
    summary.append(
      node('p', 'eyebrow', `Protocolo ${manifest.manifest.protocolVersion}`),
      node('h2', '', manifest.manifest.title),
    );
    const times = node(
      'p',
      'muted',
      `${new Date(manifest.manifest.opensAt).toLocaleString()} → ${new Date(manifest.manifest.closesAt).toLocaleString()}`,
    );
    summary.append(times);
    const credentialPanel = node('section', 'panel');
    credentialPanel.append(
      node('h2', '', '2. Credencial local'),
      node(
        'p',
        '',
        'La activación y el voto son pasos separados. La credencial no se guarda automáticamente en este dispositivo.',
      ),
    );
    const credentialActions = node('div', 'actions');
    const create = button('Generar credencial');
    create.addEventListener(
      'click',
      () =>
        void createCredential(manifest.manifest.electionId)
          .then((credential) => {
            this.credential = credential;
            this.eligibility = undefined;
            this.setStatus('Credencial creada en memoria. Descárgala antes de salir.');
            this.renderFlow();
          })
          .catch((error: unknown) => this.setStatus(this.message(error), true)),
    );
    const importInput = node('input');
    importInput.type = 'file';
    importInput.accept = 'application/json,.json';
    importInput.className = 'file-input';
    importInput.setAttribute('aria-label', 'Importar credencial privada');
    importInput.addEventListener(
      'change',
      () =>
        void readFile(importInput)
          .then(parseCredential)
          .then((credential) => {
            if (credential.electionId !== manifest.manifest.electionId)
              throw new Error('La credencial pertenece a otra elección.');
            this.credential = credential;
            this.setStatus('Credencial importada y validada en memoria.');
            this.renderFlow();
          })
          .catch((error: unknown) => this.setStatus(this.message(error), true)),
    );
    credentialActions.append(create, importInput);
    credentialPanel.append(credentialActions);
    if (this.credential) {
      const publicData = node('div', 'credential-ready');
      publicData.append(
        node('strong', '', 'Commitment para activación'),
        node('code', '', this.credential.identityCommitment),
        node(
          'p',
          'muted',
          'Este commitment puede entregarse al proceso autorizado. No entregues voterSecret.',
        ),
      );
      const save = button('Descargar credencial privada', 'secondary');
      save.addEventListener('click', () =>
        download(
          `credencial-${this.credential!.electionId}.json`,
          serializeCredential(this.credential!),
        ),
      );
      publicData.append(save);
      credentialPanel.append(publicData);
    }
    this.content.append(summary, credentialPanel);
    if (this.credential)
      this.content.append(this.renderEligibilityPanel(), this.renderBallotPanel());
    this.content.append(this.renderVerificationPanel());
  }

  private renderEligibilityPanel(): HTMLElement {
    const panel = node('section', 'panel');
    panel.append(
      node('h2', '', '3. Material de elegibilidad'),
      node('p', '', 'Importa el Merkle path provisionado. No se adjuntará a CastVote.'),
    );
    const input = node('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.setAttribute('aria-label', 'Importar material de elegibilidad');
    input.addEventListener(
      'change',
      () =>
        void readFile(input)
          .then((text) => parseEligibilityMaterial(text, this.credential!, this.manifest!.manifest))
          .then((material) => {
            this.eligibility = material;
            this.setStatus('Material de elegibilidad vinculado al root congelado.');
            this.renderFlow();
          })
          .catch((error: unknown) => this.setStatus(this.message(error), true)),
    );
    panel.append(
      input,
      node(
        'p',
        this.eligibility ? 'success' : 'muted',
        this.eligibility
          ? 'Material validado.'
          : 'No se almacena en localStorage ni se envía directamente.',
      ),
    );
    return panel;
  }

  private renderBallotPanel(): HTMLElement {
    const manifest = this.manifest!.manifest;
    const panel = node('section', 'panel');
    panel.append(node('h2', '', '4. Papeleta de selección única'));
    const fieldset = node('fieldset', 'ballot');
    const legend = node('legend', '', 'Selecciona exactamente una opción');
    fieldset.append(legend);
    manifest.options.forEach((option) => {
      const label = node('label', 'option');
      const radio = node('input');
      radio.type = 'radio';
      radio.name = 'ballot';
      radio.value = String(option.encoding);
      radio.checked = this.selectedEncoding === option.encoding;
      radio.addEventListener('change', () => {
        this.selectedEncoding = option.encoding;
        this.generated = undefined;
        this.state = 'READY';
      });
      label.append(radio, node('span', '', option.label));
      fieldset.append(label);
    });
    const generate = button(
      this.state === 'GENERATING_PROOF' ? 'Generando…' : 'Confirmar y generar prueba',
    );
    generate.disabled = !this.eligibility || this.state === 'GENERATING_PROOF';
    generate.disabled ||= this.generated !== undefined;
    generate.addEventListener('click', () => {
      if (this.selectedEncoding === undefined) {
        this.setStatus('Selecciona una opción.', true);
        return;
      }
      const selected = manifest.options.find(({ encoding }) => encoding === this.selectedEncoding);
      if (
        !globalThis.confirm(
          `Tu selección es: ${selected?.label ?? ''}.\n\nDespués de la aceptación no podrás cambiar el voto. ¿Generar la prueba?`,
        )
      )
        return;
      void this.generateProof();
    });
    const cancel = button('Cancelar generación', 'ghost');
    cancel.hidden = this.state !== 'GENERATING_PROOF';
    cancel.addEventListener('click', () => {
      this.worker.cancel();
      this.state = 'READY';
      this.setStatus('Generación cancelada. No se envió ningún voto.');
      this.renderFlow();
    });
    const proofActions = node('div', 'actions');
    proofActions.append(generate, cancel);
    panel.append(
      fieldset,
      node(
        'p',
        'privacy-note',
        'La prueba se genera en un Web Worker. JavaScript no puede garantizar zeroization física de memoria.',
      ),
      proofActions,
    );
    if (this.generated) panel.append(this.renderSubmission());
    return panel;
  }

  private async generateProof(): Promise<void> {
    const manifest = this.manifest!.manifest;
    const eligibility = this.eligibility!;
    this.state = transitionSubmission(this.state, 'GENERATE');
    this.renderFlow();
    try {
      this.generated = await this.worker.generate(
        {
          baseUrl: this.artifactBaseUrl,
          verificationKeyDigest: manifest.verificationKeyDigest,
          wasmDigest: manifest.artifactDigests['wasmSha256'] ?? '',
          zkeyDigest: manifest.artifactDigests['zkeySha256'] ?? '',
        },
        {
          electionContext: manifest.electionContext,
          merklePathElements: eligibility.merklePathElements,
          merklePathIndices: eligibility.merklePathIndices,
          merkleRoot: manifest.merkleRoot,
          optionCount: manifest.options.length,
          voteChoice: this.selectedEncoding!,
          voterSecret: this.credential!.voterSecret,
        },
        (stage) => this.setStatus(stage),
      );
      this.state = transitionSubmission(this.state, 'PROOF_CREATED');
      this.setStatus('Prueba verificada localmente y lista para enviar.');
    } catch (error: unknown) {
      this.state = 'READY';
      this.setStatus(
        error instanceof Error && error.message === 'PROOF_CANCELLED'
          ? 'Generación cancelada. No se envió ningún voto.'
          : this.message(error),
        !(error instanceof Error && error.message === 'PROOF_CANCELLED'),
      );
    }
    this.renderFlow();
  }

  private renderSubmission(): HTMLElement {
    const wrapper = node('div', 'submission');
    if (this.state === 'REJECTED') {
      const reset = button('Regenerar prueba', 'secondary');
      reset.addEventListener('click', () => {
        this.state = transitionSubmission(this.state, 'RESET');
        this.generated = undefined;
        this.renderFlow();
      });
      wrapper.append(
        node(
          'p',
          'warning',
          'El servidor rechazó la solicitud. No se asumirá que el voto fue aceptado.',
        ),
        reset,
      );
      return wrapper;
    }
    const submit = button(
      this.state === 'UNKNOWN_OUTCOME' ? 'Reintentar el mismo voto' : 'Enviar voto anónimo',
      'accent',
    );
    submit.disabled = this.state === 'SUBMITTING' || this.state === 'ACCEPTED';
    submit.addEventListener('click', () => void this.submitVote());
    wrapper.append(
      node(
        'p',
        'success',
        'Proof listo. CastVote incluirá únicamente protocolVersion, proof y publicSignals.',
      ),
      submit,
    );
    if (this.state === 'UNKNOWN_OUTCOME')
      wrapper.append(
        node(
          'p',
          'warning',
          'Resultado desconocido: el servidor pudo haber confirmado el voto. El retry conserva el mismo voto lógico.',
        ),
      );
    if (this.receipt) wrapper.append(this.renderReceipt());
    return wrapper;
  }

  private async submitVote(): Promise<void> {
    if (!this.generated || !this.manifest) return;
    this.state =
      this.state === 'UNKNOWN_OUTCOME'
        ? transitionSubmission(this.state, 'RETRY')
        : transitionSubmission(this.state, 'SUBMIT');
    this.setStatus('Enviando prueba anónima…');
    this.renderFlow();
    try {
      this.receipt = await this.votingApi.cast(this.manifest.manifest.electionId, {
        proof: this.generated.proof,
        protocolVersion: PROTOCOL_VERSION_V1,
        publicSignals: this.generated.publicSignals,
      });
      this.state = transitionSubmission(this.state, 'ACCEPT');
      this.setStatus(
        this.receipt.status === 'ALREADY_ACCEPTED'
          ? 'El servidor devolvió el receipt ya existente.'
          : 'Voto aceptado. Guarda tu receipt público.',
      );
    } catch (error: unknown) {
      if (error instanceof PublicApiError && error.code === 'NETWORK_ERROR') {
        this.state = transitionSubmission(this.state, 'TIMEOUT');
        this.setStatus(
          'No se pudo confirmar el resultado. Reintenta sin cambiar proof ni selección.',
          true,
        );
      } else {
        this.state = transitionSubmission(this.state, 'REJECT');
        this.setStatus(this.message(error), true);
      }
    }
    this.renderFlow();
  }

  private renderReceipt(): HTMLElement {
    const receipt = this.receipt!.receipt;
    const card = node('section', 'receipt');
    card.append(
      node('h3', '', 'Receipt público'),
      node(
        'p',
        '',
        'Permite comprobar inclusión posterior; por sí solo no demuestra la corrección completa ni debe usarse como prueba de selección.',
      ),
    );
    const dl = node('dl', 'receipt-data');
    for (const [term, value] of [
      ['Elección', receipt.electionId],
      ['Versión', receipt.receiptVersion],
      ['Nullifier', receipt.nullifier],
      ['Commitment', receipt.receiptCommitment],
      ['Estado', 'ACCEPTED'],
    ] as const)
      dl.append(node('dt', '', term), node('dd', '', value));
    const save = button('Descargar receipt', 'secondary');
    save.addEventListener('click', () =>
      download(`receipt-${receipt.electionId}.json`, `${JSON.stringify(receipt, null, 2)}\n`),
    );
    const copy = button('Copiar receipt público', 'ghost');
    copy.addEventListener(
      'click',
      () =>
        void navigator.clipboard
          .writeText(JSON.stringify(receipt))
          .then(() => this.setStatus('Receipt copiado.')),
    );
    const receiptActions = node('div', 'actions');
    receiptActions.append(save, copy);
    card.append(dl, receiptActions);
    return card;
  }

  private renderVerificationPanel(): HTMLElement {
    const panel = node('section', 'panel verification');
    panel.append(
      node('h2', '', 'Verificar receipt y resultados'),
      node('p', '', 'No requiere login ni voterSecret. Disponible después de la publicación.'),
    );
    const election = node('input');
    election.placeholder = 'UUID de elección';
    election.value = this.manifest?.manifest.electionId ?? '';
    const receipt = node('input');
    receipt.placeholder = 'Receipt commitment';
    const output = node('pre', 'verification-output');
    output.setAttribute('aria-live', 'polite');
    const verify = button('Comprobar inclusión', 'secondary');
    verify.addEventListener(
      'click',
      () =>
        void this.verificationApi
          .receipt(election.value, receipt.value)
          .then((value) => {
            output.textContent = JSON.stringify(value, null, 2);
          })
          .catch((error: unknown) => {
            output.textContent = this.message(error);
          }),
    );
    const results = button('Consultar resultados', 'secondary');
    results.addEventListener(
      'click',
      () =>
        void Promise.all([
          this.verificationApi.result(election.value),
          this.verificationApi.metadata(election.value),
        ])
          .then(([result, metadata]) => {
            output.textContent = JSON.stringify({ result, verification: metadata }, null, 2);
          })
          .catch((error: unknown) => {
            output.textContent = this.message(error);
          }),
    );
    const verificationActions = node('div', 'actions');
    verificationActions.append(verify, results);
    panel.append(election, receipt, verificationActions, output);
    return panel;
  }

  private setStatus(message: string, error = false): void {
    this.status.textContent = message;
    this.status.classList.toggle('error', error);
  }
  private message(error: unknown): string {
    return error instanceof Error ? error.message : 'Ocurrió un error inesperado.';
  }
}
