import { api, currentUser, formatDate, formatMoney } from './api.js';
import { setBusy, setMessage, setRegionBusy, trapFocus } from './ui.js';

const elements = {
  usersTable: document.getElementById('usersTable'),
  auditTable: document.getElementById('auditTable'),
  message: document.getElementById('adminMessage'),
  workspace: document.getElementById('accountWorkspace'),
  workspaceTitle: document.getElementById('workspace-title'),
  selectionHelp: document.getElementById('selectionHelp'),
  selectedUser: document.getElementById('selectedUser'),
  selectedAccountNumber: document.getElementById('selectedAccountNumber'),
  selectedEmail: document.getElementById('selectedEmail'),
  selectedBalance: document.getElementById('selectedBalance'),
  selectedStatus: document.getElementById('selectedStatus'),
  adjustmentValue: document.getElementById('adjustmentValue'),
  adjustmentReason: document.getElementById('adjustmentReason'),
  submitAdjustment: document.getElementById('submitAdjustment'),
  deactivateAccount: document.getElementById('deactivateAccount'),
  statusActionTitle: document.getElementById('statusActionTitle'),
  statusActionDescription: document.getElementById('statusActionDescription'),
  search: document.getElementById('userSearch'),
  statusFilter: document.getElementById('statusFilter'),
  resultsCount: document.getElementById('resultsCount'),
  modal: document.getElementById('deactivationModal'),
  modalCard: document.getElementById('statusActionModalCard'),
  modalEyebrow: document.getElementById('modalEyebrow'),
  modalTitle: document.getElementById('deactivation-title'),
  modalDescription: document.getElementById('deactivation-description'),
  modalUserName: document.getElementById('modalUserName'),
  modalAccountNumber: document.getElementById('modalAccountNumber'),
  cancelDeactivation: document.getElementById('cancelDeactivation'),
  confirmDeactivation: document.getElementById('confirmDeactivation'),
  auditSummary: document.getElementById('auditSummary'),
  auditPageIndicator: document.getElementById('auditPageIndicator'),
  previousAuditPage: document.getElementById('previousAuditPage'),
  nextAuditPage: document.getElementById('nextAuditPage'),
};

const actionNames = {
  AJUSTE_SALDO: 'Ajuste de saldo',
  DESACTIVAR_CUENTA: 'Cuenta desactivada',
  REACTIVAR_CUENTA: 'Cuenta reactivada',
};

let users = [];
let selectedAccount = null;
let pendingDeactivationAccount = null;
let pendingStatusAction = null;
let currentAdmin = null;
let lastFocusedElement = null;
let auditPage = 1;
let auditTotalPages = 1;

function showMessage(text = '', type = 'error') {
  setMessage(elements.message, text, type);
}

function cell(row, text, className = '') {
  const item = document.createElement('td');
  item.textContent = String(text ?? '');
  if (className) item.className = className;
  row.appendChild(item);
  return item;
}

function emptyRow(table, columns, text) {
  const row = table.insertRow();
  const item = row.insertCell();
  item.colSpan = columns;
  item.className = 'empty-cell';
  item.textContent = text;
}

function isProtected(user) {
  return Boolean(user) && user.rol === 'superusuario';
}

function canAdjustBalance(user) {
  return Boolean(user) && user.estado === 'activa';
}

function canDeactivate(user) {
  return canAdjustBalance(user) && !isProtected(user);
}

function canReactivate(user) {
  return Boolean(user) && user.estado === 'desactivada' && !isProtected(user);
}

function setFormEnabled(enabled) {
  elements.adjustmentValue.disabled = !enabled;
  elements.adjustmentReason.disabled = !enabled;
  elements.submitAdjustment.disabled = !enabled;
}

function setStatusAction(user) {
  const canDeactivateUser = canDeactivate(user);
  const canReactivateUser = canReactivate(user);
  const isSuperuser = isProtected(user);

  elements.deactivateAccount.className = canReactivateUser ? 'reactivate-button' : 'danger-button';
  elements.deactivateAccount.disabled = !canDeactivateUser && !canReactivateUser;

  if (canReactivateUser) {
    elements.statusActionTitle.textContent = 'Reactivar cuenta';
    elements.statusActionDescription.textContent = 'Restablece el acceso de la persona. Podrá iniciar sesión nuevamente con su contraseña actual.';
    elements.deactivateAccount.textContent = 'Reactivar cuenta';
  } else if (isSuperuser) {
    elements.statusActionTitle.textContent = 'Cuenta protegida';
    elements.statusActionDescription.textContent = 'La cuenta de superusuario no puede desactivarse desde este panel, pero sí puede recibir ajustes de saldo.';
    elements.deactivateAccount.textContent = 'Cuenta protegida';
  } else if (user?.estado === 'desactivada') {
    elements.statusActionTitle.textContent = 'Cuenta inactiva';
    elements.statusActionDescription.textContent = 'Esta cuenta está inactiva y no admite operaciones hasta que sea reactivada.';
    elements.deactivateAccount.textContent = 'Cuenta inactiva';
  } else {
    elements.statusActionTitle.textContent = 'Desactivar cuenta';
    elements.statusActionDescription.textContent = 'Impide nuevos inicios de sesión y cierra las sesiones que estén abiertas. La cuenta y su historial se conservan.';
    elements.deactivateAccount.textContent = 'Desactivar cuenta';
  }
}

function clearSelection() {
  selectedAccount = null;
  elements.workspaceTitle.textContent = 'Elige un usuario';
  elements.selectionHelp.textContent = 'Usa “Gestionar” en la tabla para cargar aquí su información.';
  elements.selectedUser.value = '';
  elements.selectedAccountNumber.textContent = '—';
  elements.selectedEmail.textContent = '—';
  elements.selectedBalance.textContent = '—';
  elements.selectedStatus.textContent = 'Sin seleccionar';
  elements.selectedStatus.className = 'status status--neutral';
  setStatusAction(null);
  setFormEnabled(false);
}

function selectUser(user, { scroll = true } = {}) {
  selectedAccount = user;
  const fullName = `${user.nombres} ${user.apellidos}`;
  const canAdjust = canAdjustBalance(user);

  elements.workspaceTitle.textContent = fullName;
  elements.selectionHelp.textContent = isProtected(user)
    ? 'Esta cuenta tiene permisos de superusuario. Puedes ajustar su saldo, pero no desactivarla.'
    : user.estado === 'desactivada'
      ? 'La cuenta está inactiva. Su información y movimientos permanecen conservados.'
      : 'Cuenta lista para una operación administrativa.';
  elements.selectedUser.value = `${user.numeroCuenta} · ${fullName}`;
  elements.selectedAccountNumber.textContent = user.numeroCuenta;
  elements.selectedEmail.textContent = user.email;
  elements.selectedBalance.textContent = formatMoney(user.saldo);
  elements.selectedStatus.textContent = user.estado === 'activa' ? 'Activa' : 'Inactiva';
  elements.selectedStatus.className = `status${user.estado === 'desactivada' ? ' inactive' : ''}`;
  setStatusAction(user);
  setFormEnabled(canAdjust);
  renderUsers();

  if (scroll) {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    elements.workspace.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
    window.setTimeout(() => elements.workspaceTitle.focus({ preventScroll: true }), reducedMotion ? 0 : 450);
  }
}

function filteredUsers() {
  const search = elements.search.value.trim().toLocaleLowerCase('es');
  const status = elements.statusFilter.value;
  return users.filter((user) => {
    const searchable = [user.nombres, user.apellidos, user.email, user.documento, user.numeroCuenta].join(' ').toLocaleLowerCase('es');
    return (!search || searchable.includes(search)) && (status === 'todos' || user.estado === status);
  });
}

function makeButton(text, className, handler) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = text;
  button.addEventListener('click', handler);
  return button;
}

function renderUsers() {
  const visibleUsers = filteredUsers();
  elements.usersTable.replaceChildren();
  elements.resultsCount.textContent = `${visibleUsers.length} ${visibleUsers.length === 1 ? 'resultado' : 'resultados'}`;

  if (!visibleUsers.length) {
    emptyRow(elements.usersTable, 5, 'No hay usuarios que coincidan con los filtros.');
    return;
  }

  visibleUsers.forEach((user) => {
    const row = elements.usersTable.insertRow();
    if (selectedAccount?.id === user.id) row.classList.add('is-selected');
    if (user.estado === 'desactivada') row.classList.add('is-inactive');

    const person = row.insertCell();
    person.className = 'person-cell';
    const name = document.createElement('strong');
    name.textContent = `${user.nombres} ${user.apellidos}`;
    const email = document.createElement('span');
    email.textContent = `${user.email} · Documento ${user.documento}`;
    person.append(name, email);

    cell(row, user.numeroCuenta, 'account');
    cell(row, formatMoney(user.saldo));
    const stateCell = row.insertCell();
    const state = document.createElement('span');
    state.className = `status${user.estado === 'desactivada' ? ' inactive' : ''}`;
    state.textContent = user.estado === 'activa' ? 'Activa' : 'Inactiva';
    stateCell.appendChild(state);

    const actionCell = row.insertCell();
    const actions = document.createElement('div');
    actions.className = 'row-actions';
    actions.appendChild(makeButton('Gestionar', 'row-action', () => {
      showMessage('', 'info');
      selectUser(user);
    }));

    if (canDeactivate(user)) {
      actions.appendChild(makeButton('Desactivar', 'row-action row-action--danger', () => openStatusAction(user, 'deactivate')));
    } else if (canReactivate(user)) {
      actions.appendChild(makeButton('Reactivar', 'row-action', () => openStatusAction(user, 'reactivate')));
    } else {
      const protectedLabel = document.createElement('span');
      protectedLabel.className = 'protected-label';
      protectedLabel.textContent = isProtected(user) ? 'Cuenta protegida' : 'Sin operaciones';
      actions.appendChild(protectedLabel);
    }
    actionCell.appendChild(actions);
  });
}

function renderSummary(summary) {
  document.getElementById('totalUsers').textContent = Number(summary.total).toLocaleString('es-CO');
  document.getElementById('activeUsers').textContent = Number(summary.activas).toLocaleString('es-CO');
  document.getElementById('inactiveUsers').textContent = Number(summary.desactivadas).toLocaleString('es-CO');
  document.getElementById('managedBalance').textContent = formatMoney(summary.saldoTotal);
}

function renderAudit(events, pagination) {
  elements.auditTable.replaceChildren();
  const first = pagination.total ? ((pagination.page - 1) * pagination.pageSize) + 1 : 0;
  const last = Math.min(pagination.page * pagination.pageSize, pagination.total);
  elements.auditSummary.textContent = pagination.total
    ? `Mostrando ${first}–${last} de ${pagination.total} acciones.`
    : 'No hay actividad administrativa registrada.';
  elements.auditPageIndicator.textContent = `Página ${pagination.page} de ${pagination.totalPages}`;
  elements.previousAuditPage.disabled = !pagination.hasPrevious;
  elements.nextAuditPage.disabled = !pagination.hasNext;
  auditPage = pagination.page;
  auditTotalPages = pagination.totalPages;
  if (!events.length) {
    emptyRow(elements.auditTable, 5, 'Aún no hay acciones administrativas registradas.');
    return;
  }

  events.forEach((event) => {
    const row = elements.auditTable.insertRow();
    cell(row, formatDate(event.creada_en));
    cell(row, actionNames[event.accion] ?? event.accion, 'audit-action');
    cell(row, event.administrador);
    const affected = event.usuario_afectado
      ? `${event.usuario_afectado}${event.cuenta_afectada ? ` · ${event.cuenta_afectada}` : ''}`
      : '—';
    cell(row, affected);
    cell(row, event.motivo);
  });

}

function syncAuditPagination() {
  elements.previousAuditPage.disabled = auditPage <= 1;
  elements.nextAuditPage.disabled = auditPage >= auditTotalPages;
}

async function loadData({ preserveSelection = true } = {}) {
  setRegionBusy(document.getElementById('adminTop'), true);
  const selectedId = preserveSelection ? selectedAccount?.id : null;
  try {
    const [{ users: loadedUsers, summary }, { audit, pagination: auditPagination }] = await Promise.all([
      api('/admin/users?limit=200'),
      api(`/admin/audit?page=${auditPage}`),
    ]);
    users = loadedUsers;
    renderSummary(summary);
    renderAudit(audit, auditPagination);

    const refreshedSelection = users.find((user) => user.id === selectedId);
    if (refreshedSelection) selectUser(refreshedSelection, { scroll: false });
    else clearSelection();

    renderUsers();
  } finally {
    setRegionBusy(document.getElementById('adminTop'), false);
  }
}

function openStatusAction(user = selectedAccount, action = canReactivate(user) ? 'reactivate' : 'deactivate') {
  if ((action === 'deactivate' && !canDeactivate(user)) || (action === 'reactivate' && !canReactivate(user))) return;
  pendingDeactivationAccount = user;
  pendingStatusAction = action;
  lastFocusedElement = document.activeElement;
  const isReactivation = action === 'reactivate';
  elements.modalCard.classList.toggle('is-reactivation', isReactivation);
  elements.modalEyebrow.textContent = isReactivation ? 'Confirmación administrativa' : 'Confirmación administrativa';
  elements.modalTitle.textContent = isReactivation ? '¿Reactivar esta cuenta?' : '¿Desactivar esta cuenta?';
  elements.modalDescription.textContent = isReactivation
    ? 'La persona volverá a poder iniciar sesión con la contraseña que ya tiene registrada.'
    : 'El usuario no podrá iniciar sesión y cualquier sesión abierta será cerrada.';
  elements.confirmDeactivation.className = isReactivation ? 'reactivate-button' : 'danger-button';
  elements.confirmDeactivation.textContent = isReactivation ? 'Sí, reactivar cuenta' : 'Sí, desactivar cuenta';
  elements.modalUserName.textContent = `${user.nombres} ${user.apellidos}`;
  elements.modalAccountNumber.textContent = user.numeroCuenta;
  elements.modal.hidden = false;
  document.body.classList.add('modal-open');
  elements.cancelDeactivation.focus();
}

function closeDeactivation() {
  elements.modal.hidden = true;
  document.body.classList.remove('modal-open');
  pendingDeactivationAccount = null;
  pendingStatusAction = null;
  lastFocusedElement?.focus();
}

document.getElementById('adjustmentForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!canAdjustBalance(selectedAccount)) return showMessage('Selecciona una cuenta activa antes de registrar el ajuste.');

  const value = Number(elements.adjustmentValue.value);
  const reason = elements.adjustmentReason.value.trim();
  if (!Number.isSafeInteger(value) || value === 0) return showMessage('Ingresa un valor entero diferente de cero.');
  if (reason.length < 5) return showMessage('El motivo del ajuste debe tener al menos 5 caracteres.');

  setBusy(elements.submitAdjustment, true, 'Registrando ajuste…');
  try {
    await api(`/admin/users/${selectedAccount.id}/adjust-balance`, {
      method: 'POST',
      body: JSON.stringify({ valor: value, motivo: reason }),
    });
    elements.adjustmentValue.value = '';
    elements.adjustmentReason.value = '';
    await loadData();
    showMessage(`Ajuste registrado correctamente en la cuenta ${selectedAccount.numeroCuenta}.`, 'success');
  } catch (error) {
    showMessage(error.message);
  } finally {
    setBusy(elements.submitAdjustment, false);
    elements.submitAdjustment.disabled = !canAdjustBalance(selectedAccount);
  }
});

elements.deactivateAccount.addEventListener('click', () => openStatusAction());
elements.cancelDeactivation.addEventListener('click', closeDeactivation);
elements.modal.querySelector('[data-modal-cancel]').addEventListener('click', closeDeactivation);
elements.confirmDeactivation.addEventListener('click', async () => {
  const targetAccount = pendingDeactivationAccount;
  const action = pendingStatusAction;
  if (!targetAccount || !action || (action === 'deactivate' && !canDeactivate(targetAccount)) || (action === 'reactivate' && !canReactivate(targetAccount))) return closeDeactivation();
  const userId = targetAccount.id;
  const accountNumber = targetAccount.numeroCuenta;
  setBusy(elements.confirmDeactivation, true, action === 'reactivate' ? 'Reactivando…' : 'Desactivando…');
  try {
    await api(`/admin/users/${userId}/${action}`, { method: 'POST' });
    closeDeactivation();
    await loadData();
    showMessage(action === 'reactivate'
      ? `La cuenta ${accountNumber} fue reactivada correctamente.`
      : `La cuenta ${accountNumber} quedó inactiva y sus sesiones fueron cerradas.`, 'success');
    elements.workspaceTitle.focus({ preventScroll: true });
  } catch (error) {
    closeDeactivation();
    showMessage(error.message);
  } finally {
    setBusy(elements.confirmDeactivation, false);
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !elements.modal.hidden) closeDeactivation();
  trapFocus(elements.modal, event);
});

elements.search.addEventListener('input', renderUsers);
elements.statusFilter.addEventListener('change', renderUsers);
elements.previousAuditPage.addEventListener('click', async () => {
  if (auditPage <= 1) return;
  setBusy(elements.previousAuditPage, true, 'Cargando…');
  auditPage -= 1;
  try { await loadData(); } catch (error) { showMessage(error.message); }
  finally { setBusy(elements.previousAuditPage, false); syncAuditPagination(); }
});
elements.nextAuditPage.addEventListener('click', async () => {
  if (auditPage >= auditTotalPages) return;
  setBusy(elements.nextAuditPage, true, 'Cargando…');
  auditPage += 1;
  try { await loadData(); } catch (error) { auditPage -= 1; showMessage(error.message); }
  finally { setBusy(elements.nextAuditPage, false); syncAuditPagination(); }
});
document.getElementById('reloadUsers').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  setBusy(button, true, 'Actualizando…');
  try {
    await loadData();
    showMessage('Los datos fueron actualizados.', 'info');
  } catch (error) {
    showMessage(error.message);
  } finally {
    setBusy(button, false);
  }
});

window.addEventListener('DOMContentLoaded', async () => {
  try {
    currentAdmin = await currentUser();
    if (currentAdmin.rol !== 'superusuario') return window.location.replace('/html/dashboard.html');
    document.getElementById('adminIdentity').textContent = `${currentAdmin.nombres} ${currentAdmin.apellidos}`;
    await loadData({ preserveSelection: false });
  } catch (error) {
    showMessage(error.message);
  }
});
