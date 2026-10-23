// JSX and TSX: components, conditional rendering, callbacks in props, and typed
// hooks. JSX `&&` is left out until its exclusion lands.

type Item = { id: string; done: boolean; label?: string };

export function List({ items, compact }: { items: Item[]; compact?: boolean }) {
	if (!items.length) {
		return <p>Empty</p>;
	}
	return (
		<ul className={compact ? "compact" : undefined}>
			{items.map((item) => (
				<li key={item.id} onClick={() => (item.done ? undefined : select(item))}>
					{item.label ?? item.id}
					{item.done ? <Check /> : null}
				</li>
			))}
		</ul>
	);
}

export const Toggle = ({ on, onChange }: { on: boolean; onChange: (next: boolean) => void }) => {
	const handle = (event: { shiftKey: boolean }) => {
		if (event.shiftKey) {
			return;
		}
		onChange(!on);
	};
	return <button onClick={handle}>{on ? "On" : "Off"}</button>;
};

export class Panel extends Component<{ open: boolean }> {
	render() {
		const { open } = this.props;
		for (const child of this.children) {
			if (child.hidden) {
				continue;
			}
		}
		return open ? <section>{this.children.map((child) => <Child key={child.id} {...child} />)}</section> : null;
	}
}

export function useLatest<T>(value: T, ready: boolean): T | undefined {
	return ready ? (value satisfies T) : undefined;
}
