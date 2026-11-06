export interface DeliveryVarianceInfo {
  label: string;
  diffDays: number | null;
  type: 'early' | 'on-time' | 'delayed' | 'overdue' | 'pending';
  badgeClass: string;
  subText: string;
}

export function calculateDeliveryVariance(
  plannedDeliveryDate?: string,
  actualDeliveredDate?: string,
  status?: string
): DeliveryVarianceInfo {
  // If no planned delivery date
  if (!plannedDeliveryDate) {
    return {
      label: 'No Delivery Set',
      diffDays: null,
      type: 'pending',
      badgeClass: 'bg-slate-800 text-slate-400 border border-slate-700',
      subText: 'Date pending'
    };
  }

  const plannedTime = new Date(plannedDeliveryDate + 'T00:00:00').getTime();

  // If actual delivered date is present
  if (actualDeliveredDate) {
    const actualTime = new Date(actualDeliveredDate + 'T00:00:00').getTime();
    const diffDays = Math.round((actualTime - plannedTime) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return {
        label: 'Delivered On-Time',
        diffDays: 0,
        type: 'on-time',
        badgeClass: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40',
        subText: 'Exact match (0d diff)'
      };
    } else if (diffDays < 0) {
      const earlyDays = Math.abs(diffDays);
      return {
        label: `${earlyDays}d Ahead of Schedule`,
        diffDays,
        type: 'early',
        badgeClass: 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40',
        subText: `${earlyDays} days earlier`
      };
    } else {
      return {
        label: `+${diffDays}d Delay`,
        diffDays,
        type: 'delayed',
        badgeClass: 'bg-rose-500/20 text-rose-300 border border-rose-500/40',
        subText: `${diffDays} days past target`
      };
    }
  }

  // If project is marked CLOSED or Completed without a separate actualDeliveredDate
  if (status === 'CLOSED' || status === 'Completed') {
    return {
      label: 'Completed / Closed',
      diffDays: 0,
      type: 'on-time',
      badgeClass: 'bg-slate-700/80 text-slate-200 border border-slate-600',
      subText: 'Delivered'
    };
  }

  // Not delivered yet, calculate against today's date
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const diffFromToday = Math.round((plannedTime - now.getTime()) / (1000 * 60 * 60 * 24));

  if (diffFromToday < 0) {
    const overdueDays = Math.abs(diffFromToday);
    return {
      label: `${overdueDays}d Overdue`,
      diffDays: diffFromToday,
      type: 'overdue',
      badgeClass: 'bg-rose-500/20 text-rose-400 border border-rose-500/30',
      subText: `Was due ${overdueDays}d ago`
    };
  } else if (diffFromToday === 0) {
    return {
      label: 'Due Today',
      diffDays: 0,
      type: 'pending',
      badgeClass: 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
      subText: 'Target today'
    };
  } else {
    return {
      label: `${diffFromToday}d Remaining`,
      diffDays: diffFromToday,
      type: 'pending',
      badgeClass: 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30',
      subText: `${diffFromToday} days until target`
    };
  }
}

export function getProjectStatusStyle(status: string): string {
  switch (status) {
    case 'WIP':
      return 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30';
    case 'On Track':
      return 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
    case 'At Risk':
      return 'bg-rose-500/20 text-rose-400 border border-rose-500/30';
    case 'HOLD':
      return 'bg-amber-500/20 text-amber-400 border border-amber-500/30';
    case 'CLOSED':
    case 'Completed':
      return 'bg-slate-700/80 text-slate-300 border border-slate-600';
    case 'Delayed':
      return 'bg-red-500/20 text-red-400 border border-red-500/30';
    default:
      return 'bg-blue-500/20 text-blue-400 border border-blue-500/30';
  }
}
