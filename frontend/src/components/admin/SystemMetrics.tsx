import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    AreaChart,
    Area
} from 'recharts';
import { Cpu, HardDrive, Network } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { configService } from '@/services';

interface ChartDataPoint {
    time: string;
    cpu: number;
    ram: number;
    net_rx: number;
    net_tx: number;
}

export function SystemMetrics() {
    const { t } = useTranslation('admin/overview');
    const [history, setHistory] = useState<ChartDataPoint[]>([]);

    const { data: metrics } = useQuery({
        queryKey: ['admin-system-metrics'],
        queryFn: async () => {
            const result = await configService.getSystemMetrics();
            if (result.success && result.data) {
                return result.data;
            }
            return null;
        },
        refetchInterval: 3000, // Poll every 3 seconds
        refetchIntervalInBackground: false
    });

    useEffect(() => {
        if (metrics) {
            const now = new Date();
            const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;

            const cpuUsage = Math.round(metrics.cpu_usage);
            const ramUsage = metrics.ram_total > 0 ? Math.round((metrics.ram_used / metrics.ram_total) * 100) : 0;
            // Convert bytes/s to Mbps
            const rxMbps = parseFloat(((metrics.net_rx * 8) / 1000000).toFixed(2));
            const txMbps = parseFloat(((metrics.net_tx * 8) / 1000000).toFixed(2));

            setHistory((prev) => {
                const newHistory = [...prev, {
                    time: timeStr,
                    cpu: cpuUsage,
                    ram: ramUsage,
                    net_rx: rxMbps,
                    net_tx: txMbps,
                }];
                // Keep last 20 data points
                if (newHistory.length > 20) {
                    return newHistory.slice(newHistory.length - 20);
                }
                return newHistory;
            });
        }
    }, [metrics]);

    const currentCpu = history.length > 0 ? history[history.length - 1].cpu : 0;
    const currentRam = history.length > 0 ? history[history.length - 1].ram : 0;

    // Custom tooltips
    const CustomTooltip = ({ active, payload, label }: any) => {
        if (active && payload && payload.length) {
            return (
                <div className="bg-background border border-border p-2 rounded shadow-md text-xs">
                    <p className="font-semibold">{label}</p>
                    {payload.map((entry: any, index: number) => (
                        <p key={index} style={{ color: entry.color }}>
                            {entry.name}: {entry.value}{entry.unit}
                        </p>
                    ))}
                </div>
            );
        }
        return null;
    };

    return (
        <div className="space-y-6 mt-6">
            <h3 className="text-lg font-medium text-foreground">Real-Time Performance</h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                {/* CPU & RAM Chart */}
                <Card>
                    <CardContent className="p-4">
                        <div className="flex justify-between items-center mb-4">
                            <div className="flex items-center space-x-2">
                                <Cpu className="h-5 w-5 text-blue-500" />
                                <span className="font-medium">CPU & Memory</span>
                            </div>
                            <div className="text-sm space-x-4">
                                <span className="text-blue-500 font-semibold">CPU: {currentCpu}%</span>
                                <span className="text-purple-500 font-semibold">RAM: {currentRam}%</span>
                            </div>
                        </div>
                        <div className="h-48">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={history} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--muted-foreground)/0.2)" />
                                    <XAxis dataKey="time" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                                    <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Line type="monotone" dataKey="cpu" name="CPU" stroke="#3b82f6" strokeWidth={2} dot={false} unit="%" isAnimationActive={false} />
                                    <Line type="monotone" dataKey="ram" name="RAM" stroke="#a855f7" strokeWidth={2} dot={false} unit="%" isAnimationActive={false} />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>

                {/* Network IO Chart */}
                <Card>
                    <CardContent className="p-4">
                        <div className="flex justify-between items-center mb-4">
                            <div className="flex items-center space-x-2">
                                <Network className="h-5 w-5 text-green-500" />
                                <span className="font-medium">Network I/O</span>
                            </div>
                            <div className="text-sm space-x-4">
                                <span className="text-green-500 font-semibold">RX: {history.length > 0 ? history[history.length - 1].net_rx : 0} Mbps</span>
                                <span className="text-orange-500 font-semibold">TX: {history.length > 0 ? history[history.length - 1].net_tx : 0} Mbps</span>
                            </div>
                        </div>
                        <div className="h-48">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={history} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--muted-foreground)/0.2)" />
                                    <XAxis dataKey="time" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                                    <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Area type="monotone" dataKey="net_rx" name="Download" stroke="#22c55e" fill="#22c55e" fillOpacity={0.2} strokeWidth={2} unit=" Mbps" isAnimationActive={false} />
                                    <Area type="monotone" dataKey="net_tx" name="Upload" stroke="#f97316" fill="#f97316" fillOpacity={0.2} strokeWidth={2} unit=" Mbps" isAnimationActive={false} />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>

            </div>
        </div>
    );
}
