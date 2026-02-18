function push(data: Record<string, unknown>) {
  if (typeof window === 'undefined') return;
  window.dataLayer = window.dataLayer ?? [];
  window.dataLayer.push(data);
}

export function trackSignup(method: string) {
  push({ event: 'sign_up', method });
}

export function trackTrialStart(rating: string) {
  push({ event: 'trial_start', rating });
}

export function trackPurchase(transactionId: string, value: number, plan: string) {
  push({
    event: 'purchase',
    ecommerce: {
      transaction_id: transactionId,
      value,
      currency: 'USD',
      items: [{ item_name: plan }],
    },
  });
}

export function pushPageData(pageType: string, userStatus: string, userPlan: string) {
  push({ page_type: pageType, user_status: userStatus, user_plan: userPlan });
}
