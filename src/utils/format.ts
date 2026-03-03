export function formatBrewDate(iso: string): { date: string; time: string } {
	const d = new Date(iso);
	const yy = String(d.getFullYear()).slice(2);
	const mm = String(d.getMonth() + 1).padStart(2, '0');
	const dd = String(d.getDate()).padStart(2, '0');
	const h = d.getHours();
	const h12 = h % 12 || 12;
	const min = String(d.getMinutes()).padStart(2, '0');
	const ampm = h < 12 ? 'AM' : 'PM';
	return { date: `${yy}-${mm}-${dd}`, time: `${ampm} ${h12}:${min}` };
}
