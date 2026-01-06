const computeSla = (ticket) => {
  if (!ticket.sla_due_at) return { status: 'Unknown', minutes_remaining: null };

  if (ticket.status === 'Resolved') {
    return { status: 'Met/Resolved', minutes_remaining: null };
  }

  const now = new Date();
  const due = new Date(ticket.sla_due_at);
  const diffMinutes = Math.round((due.getTime() - now.getTime()) / (1000 * 60));

  if (diffMinutes < 0) {
    return { status: 'Breached', minutes_remaining: diffMinutes };
  }
  if (diffMinutes <= 60) {
    return { status: 'At Risk', minutes_remaining: diffMinutes };
  }

  return { status: 'On Track', minutes_remaining: diffMinutes };
};

module.exports = { computeSla };
