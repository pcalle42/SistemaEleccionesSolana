import { AdminApiClient, AdminApiError, type Election } from '../api/admin-api.js';

const element = <K extends keyof HTMLElementTagNameMap>(
  name: K,
  className?: string,
  text?: string,
) => {
  const node = document.createElement(name);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

function field(label: string, input: HTMLInputElement): HTMLLabelElement {
  const wrapper = element('label', 'field');
  wrapper.append(element('span', '', label), input);
  return wrapper;
}

export class AdminApp {
  private readonly api: AdminApiClient;
  private elections: readonly Election[] = [];
  private selected: Election | undefined;
  private busy = false;

  constructor(
    private readonly root: HTMLElement,
    baseUrl: string,
  ) {
    this.api = new AdminApiClient(baseUrl);
  }

  async start(): Promise<void> {
    try {
      await this.api.session();
      await this.showWorkspace();
    } catch {
      this.showLogin();
    }
  }

  private showLogin(message?: string): void {
    this.root.replaceChildren();
    const shell = element('main', 'login-shell');
    shell.id = 'main';
    const card = element('section', 'login-card');
    card.setAttribute('aria-labelledby', 'login-title');
    card.append(element('p', 'eyebrow', 'Consola administrativa'));
    const title = element('h1', '', 'Administrar una elección verificable');
    title.id = 'login-title';
    card.append(title);
    card.append(
      element(
        'p',
        'lede',
        'Esta superficie usa una sesión HttpOnly y protección CSRF. No contiene herramientas de votación ni secretos del votante.',
      ),
    );
    const status = element('p', 'status', message ?? 'Inicia sesión para continuar.');
    status.setAttribute('role', 'status');
    const form = element('form', 'stack');
    const username = element('input');
    username.name = 'username';
    username.autocomplete = 'username';
    username.required = true;
    const password = element('input');
    password.name = 'password';
    password.type = 'password';
    password.autocomplete = 'current-password';
    password.required = true;
    const submit = element('button', 'primary', 'Iniciar sesión');
    submit.type = 'submit';
    form.append(field('Usuario', username), field('Contraseña', password), status, submit);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      submit.disabled = true;
      status.textContent = 'Verificando credenciales…';
      void this.api
        .login(username.value, password.value)
        .then(() => this.showWorkspace())
        .catch((error: unknown) => {
          status.textContent = this.message(error);
          submit.disabled = false;
        });
    });
    card.append(form);
    shell.append(card);
    this.root.append(shell);
  }

  private async showWorkspace(): Promise<void> {
    this.root.replaceChildren();
    const header = element('header', 'topbar');
    const brand = element('div');
    brand.append(element('span', 'brand-mark', 'V'), element('strong', '', 'Votaciones Admin'));
    const logout = element('button', 'ghost', 'Cerrar sesión');
    logout.addEventListener(
      'click',
      () => void this.api.logout().finally(() => this.showLogin('Sesión cerrada.')),
    );
    header.append(brand, logout);
    const main = element('main', 'workspace');
    main.id = 'main';
    const intro = element('section', 'hero');
    intro.append(
      element('p', 'eyebrow', 'Control electoral'),
      element('h1', '', 'Operaciones con evidencia, no con suposiciones'),
      element(
        'p',
        'lede',
        'Las transiciones críticas se confirman en el servidor. Los conteos nunca se introducen manualmente.',
      ),
    );
    const status = element('p', 'status');
    status.id = 'global-status';
    status.setAttribute('role', 'status');
    const grid = element('div', 'admin-grid');
    const list = element('section', 'panel');
    list.setAttribute('aria-labelledby', 'elections-title');
    const listTitle = element('h2', '', 'Elecciones');
    listTitle.id = 'elections-title';
    const createDetails = element('details', 'create-election');
    const createSummary = element('summary', '', 'Crear elección en borrador');
    createDetails.append(createSummary);
    const createForm = element('form', 'stack compact');
    const titleInput = element('input');
    titleInput.required = true;
    titleInput.maxLength = 200;
    const opensInput = element('input');
    opensInput.type = 'datetime-local';
    opensInput.required = true;
    const closesInput = element('input');
    closesInput.type = 'datetime-local';
    closesInput.required = true;
    const optionA = element('input');
    optionA.required = true;
    const optionB = element('input');
    optionB.required = true;
    const createButton = element('button', 'primary', 'Crear borrador');
    createButton.type = 'submit';
    createForm.append(
      field('Título', titleInput),
      field('Apertura', opensInput),
      field('Cierre', closesInput),
      field('Opción A', optionA),
      field('Opción B', optionB),
      createButton,
    );
    createForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const opensAt = new Date(opensInput.value);
      const closesAt = new Date(closesInput.value);
      if (
        !Number.isFinite(opensAt.getTime()) ||
        !Number.isFinite(closesAt.getTime()) ||
        closesAt <= opensAt
      ) {
        status.textContent = 'La apertura y cierre no forman un intervalo válido.';
        return;
      }
      createButton.disabled = true;
      status.textContent = 'Creando borrador…';
      void this.api
        .createElection({
          title: titleInput.value,
          opensAt: opensAt.toISOString(),
          closesAt: closesAt.toISOString(),
          options: [
            { displayOrder: 0, label: optionA.value },
            { displayOrder: 1, label: optionB.value },
          ],
        })
        .then(async (created) => {
          this.elections = await this.api.listElections();
          this.selected = created;
          status.textContent = 'Borrador creado. Configúralo antes de prepararlo.';
          this.renderElectionList(cards, detail, status);
          createDetails.open = false;
        })
        .catch((error: unknown) => {
          status.textContent = this.message(error);
        })
        .finally(() => {
          createButton.disabled = false;
        });
    });
    createDetails.append(createForm);
    const cards = element('div', 'election-list');
    list.append(listTitle, createDetails, cards);
    const detail = element('section', 'panel detail');
    detail.setAttribute('aria-live', 'polite');
    grid.append(list, detail);
    main.append(intro, status, grid);
    this.root.append(header, main);
    try {
      this.elections = await this.api.listElections();
      this.renderElectionList(cards, detail, status);
    } catch (error: unknown) {
      status.textContent = this.message(error);
    }
  }

  private renderElectionList(cards: HTMLElement, detail: HTMLElement, status: HTMLElement): void {
    cards.replaceChildren();
    if (this.elections.length === 0)
      cards.append(
        element(
          'p',
          'empty',
          'Aún no hay elecciones. La creación detallada permanece disponible en la API administrativa.',
        ),
      );
    for (const election of this.elections) {
      const button = element(
        'button',
        `election-card${this.selected?.id === election.id ? ' selected' : ''}`,
      );
      button.append(
        element('strong', '', election.title),
        element('span', `badge state-${election.status.toLowerCase()}`, election.status),
        element(
          'small',
          '',
          `${new Date(election.opensAt).toLocaleString()} → ${new Date(election.closesAt).toLocaleString()}`,
        ),
      );
      button.addEventListener('click', () => {
        this.selected = election;
        this.renderElectionList(cards, detail, status);
      });
      cards.append(button);
    }
    this.renderDetail(detail, status, () => this.renderElectionList(cards, detail, status));
  }

  private renderDetail(detail: HTMLElement, status: HTMLElement, refresh: () => void): void {
    detail.replaceChildren();
    const election = this.selected ?? this.elections[0];
    if (!election) {
      detail.append(element('h2', '', 'Selecciona una elección'));
      return;
    }
    this.selected = election;
    detail.append(
      element('p', 'eyebrow', `Configuración v${election.configurationVersion}`),
      element('h2', '', election.title),
      element('p', '', election.description ?? 'Sin descripción.'),
    );
    const metadata = element('dl', 'metadata');
    for (const [term, value] of [
      ['Estado', election.status],
      ['Protocolo', election.protocolVersion ?? 'No fijado'],
      ['Circuito', election.circuitVersion ?? 'No fijado'],
    ] as const)
      metadata.append(element('dt', '', term), element('dd', '', value));
    detail.append(metadata, element('h3', '', 'Opciones congeladas'));
    const options = element('ol', 'options');
    election.options.forEach((option) => options.append(element('li', '', option.label)));
    detail.append(options);
    const actions = element('div', 'actions');
    const allowed: Record<Election['status'], readonly string[]> = {
      DRAFT: ['eligibility-snapshots', 'checkpoints', 'ready'],
      READY: ['checkpoints', 'open'],
      OPEN: ['close', 'cancel'],
      CLOSED: ['enter-counting'],
      COUNTING: ['compute-tally', 'verification-package', 'publish-results'],
      RESULTS_PUBLISHED: [],
      CANCELLED: [],
    };
    for (const action of allowed[election.status]) {
      const labels: Record<string, string> = {
        ready: 'Preparar',
        open: 'Abrir',
        close: 'Cerrar',
        cancel: 'Cancelar',
        checkpoints: 'Crear checkpoint',
        'eligibility-snapshots': 'Construir snapshot',
        'enter-counting': 'Congelar conjunto',
        'compute-tally': 'Calcular conteo',
        'verification-package': 'Generar paquete',
        'publish-results': 'Publicar resultados',
      };
      const button = element(
        'button',
        action === 'publish-results' || action === 'cancel' ? 'danger' : 'primary',
        labels[action] ?? action,
      );
      button.disabled = this.busy;
      button.addEventListener('click', () => void this.execute(election, action, status, refresh));
      actions.append(button);
    }
    detail.append(
      element('h3', '', 'Acciones permitidas'),
      actions,
      this.renderProvisioning(election, status),
      this.renderAudit(election, status),
      element(
        'p',
        'privacy-note',
        'Durante OPEN no se consulta ni muestra un conteo parcial. Toda publicación exige snapshot, tally y paquete verificados.',
      ),
    );
  }

  private renderProvisioning(election: Election, status: HTMLElement): HTMLElement {
    const details = element('details', 'provisioning');
    const summary = element('summary', '', 'Provisionar commitment de credencial');
    details.append(summary);
    const form = element('form', 'stack compact');
    const voter = element('select');
    voter.required = true;
    const placeholder = element('option', '', 'Cargar votantes…');
    placeholder.value = '';
    voter.append(placeholder);
    const commitment = element('input');
    commitment.required = true;
    commitment.placeholder = 'Field element BN254';
    const submit = element('button', 'secondary', 'Registrar commitment');
    submit.type = 'submit';
    submit.disabled = true;
    details.addEventListener('toggle', () => {
      if (!details.open || voter.options.length > 1) return;
      void this.api
        .listVoters()
        .then((voters) => {
          placeholder.textContent = 'Selecciona una persona elegible';
          for (const item of voters.filter(({ status: voterStatus }) => voterStatus === 'ACTIVE')) {
            const option = element(
              'option',
              '',
              item.displayName ?? item.externalReference ?? item.id,
            );
            option.value = item.id;
            voter.append(option);
          }
          submit.disabled = false;
        })
        .catch((error: unknown) => {
          status.textContent = this.message(error);
        });
    });
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (
        !globalThis.confirm(
          `Registrar commitment para la elección ${election.title}. El secreto nunca debe pegarse aquí. ¿Continuar?`,
        )
      )
        return;
      submit.disabled = true;
      void this.api
        .registerCredential(voter.value, commitment.value)
        .then(() => {
          commitment.value = '';
          status.textContent = 'Commitment registrado; voterSecret no fue recibido.';
        })
        .catch((error: unknown) => {
          status.textContent = this.message(error);
        })
        .finally(() => {
          submit.disabled = false;
        });
    });
    const voterLabel = element('label', 'field');
    voterLabel.append(element('span', '', 'Persona elegible'), voter);
    form.append(voterLabel, field('Identity commitment', commitment), submit);
    details.append(form);
    return details;
  }

  private renderAudit(election: Election, status: HTMLElement): HTMLElement {
    const details = element('details', 'provisioning');
    const summary = element('summary', '', 'Auditoría append-only');
    const output = element('pre', 'audit-output', 'Abre para cargar los eventos de esta elección.');
    details.append(summary, output);
    details.addEventListener('toggle', () => {
      if (!details.open || output.dataset['loaded']) return;
      output.textContent = 'Cargando…';
      void this.api
        .audit(`election:${election.id}`)
        .then((events) => {
          output.textContent = JSON.stringify(events, null, 2);
          output.dataset['loaded'] = 'true';
        })
        .catch((error: unknown) => {
          output.textContent = this.message(error);
          status.textContent = this.message(error);
        });
    });
    return details;
  }

  private async execute(
    election: Election,
    action: string,
    status: HTMLElement,
    refresh: () => void,
  ): Promise<void> {
    const destination = action === 'publish-results' ? 'RESULTS_PUBLISHED' : action.toUpperCase();
    if (
      !globalThis.confirm(
        `Elección: ${election.title}\nEstado actual: ${election.status}\nAcción: ${destination}\n\nEsta operación será auditada. ¿Continuar?`,
      )
    )
      return;
    this.busy = true;
    refresh();
    status.textContent = 'Procesando operación crítica…';
    try {
      await this.api.transition(
        election.id,
        action,
        action === 'cancel'
          ? { reason: 'Cancelación confirmada desde consola administrativa.' }
          : undefined,
      );
      this.elections = await this.api.listElections();
      this.selected = this.elections.find(({ id }) => id === election.id);
      status.textContent = 'Operación confirmada por el servidor.';
    } catch (error: unknown) {
      status.textContent =
        this.message(error) +
        (error instanceof AdminApiError && error.status === 409
          ? ' Se refrescó el estado; no se sobrescribió.'
          : '');
      this.elections = await this.api.listElections().catch(() => this.elections);
    } finally {
      this.busy = false;
      refresh();
    }
  }

  private message(error: unknown): string {
    return error instanceof Error ? error.message : 'Ocurrió un error inesperado.';
  }
}
