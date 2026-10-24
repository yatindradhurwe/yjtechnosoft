/** Loads Razorpay Checkout on demand */
let loading: Promise<void> | null = null;

export function loadRazorpay(): Promise<void> {
  if ((window as any).Razorpay) return Promise.resolve();
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://checkout.razorpay.com/v1/checkout.js';
      s.onload = () => resolve();
      s.onerror = () => {
        loading = null;
        reject(new Error('Could not load the payment window. Check your connection and try again.'));
      };
      document.body.appendChild(s);
    });
  }
  return loading;
}

export interface RazorpayResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

export function openRazorpay(opts: { keyId: string; orderId: string; amount: number; currency: string; name: string; description: string; prefill: Record<string, string | undefined>; themeColor: string }): Promise<RazorpayResponse | null> {
  return new Promise((resolve) => {
    const rzp = new (window as any).Razorpay({
      key: opts.keyId,
      order_id: opts.orderId,
      amount: opts.amount,
      currency: opts.currency,
      name: opts.name,
      description: opts.description,
      prefill: opts.prefill,
      theme: { color: opts.themeColor },
      handler: (r: RazorpayResponse) => resolve(r),
      modal: { ondismiss: () => resolve(null) },
    });
    rzp.on('payment.failed', () => undefined);
    rzp.open();
  });
}
