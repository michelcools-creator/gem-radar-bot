import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { AlertCircle, TrendingUp, RefreshCw, Settings, ExternalLink } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Link } from 'react-router-dom';

interface Coin {
  id: string;
  name: string;
  symbol: string;
  first_seen: string;
  status: string;
  scores?: {
    overall: number;
    confidence: number;
    pillars: Record<string, number>;
    red_flags: string[];
    green_flags: string[];
  }[];
}

const Dashboard = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isRunning, setIsRunning] = useState(false);

  const { data: coins, isLoading } = useQuery({
    queryKey: ['coins'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('coins')
        .select(`
          id, name, symbol, first_seen, status,
          scores:scores(overall, confidence, pillars, red_flags, green_flags)
        `)
        .order('first_seen', { ascending: false })
        .limit(50);
      
      if (error) throw error;
      return data as Coin[];
    }
  });

  const runPipeline = useMutation({
    mutationFn: async () => {
      setIsRunning(true);
      const { data, error } = await supabase.functions.invoke('pipeline-run');
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast({
        title: "Pipeline Started",
        description: "The analysis pipeline is now running. Results will appear shortly.",
      });
      queryClient.invalidateQueries({ queryKey: ['coins'] });
    },
    onError: (error: any) => {
      toast({
        title: "Pipeline Error",
        description: error.message || "Failed to start pipeline",
        variant: "destructive",
      });
    },
    onSettled: () => {
      setIsRunning(false);
    }
  });

  const getStatusColor = (status: string) => {
    const colors = {
      pending: 'bg-yellow-500',
      processing: 'bg-blue-500',
      analyzed: 'bg-green-500',
      failed: 'bg-red-500',
      insufficient_data: 'bg-gray-500'
    };
    return colors[status as keyof typeof colors] || 'bg-gray-500';
  };

  const getScoreColor = (score: number) => {
    if (score >= 70) return 'text-green-600';
    if (score >= 50) return 'text-yellow-600';
    return 'text-red-600';
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <RefreshCw className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  const analyzedCoins = coins?.filter(coin => coin.scores?.length > 0) || [];
  const highScoreCoins = analyzedCoins.filter(coin => coin.scores?.[0]?.overall >= 70);

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold mb-2">New-Coin Radar (Web-Only)</h1>
          <p className="text-sm text-muted-foreground mb-2">
            🔬 Research tool only - not investment advice. Respects robots.txt and rate limits.
          </p>
          <p className="text-muted-foreground">
            Analyzes new cryptocurrency projects using Web-Only scoring methodology
          </p>
        </div>
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={() => runPipeline.mutate()}
            disabled={isRunning}
          >
            {isRunning ? (
              <RefreshCw className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-2" />
            )}
            Run Analysis
          </Button>
          <Link to="/settings">
            <Button variant="outline">
              <Settings className="w-4 h-4 mr-2" />
              Settings
            </Button>
          </Link>
        </div>
      </div>

      {/* Disclaimer */}
      <Alert className="mb-6">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          <strong>Research Only:</strong> This tool provides research insights based on web content analysis. 
          Not investment advice. Always do your own research before making investment decisions.
        </AlertDescription>
      </Alert>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Coins</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{coins?.length || 0}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Analyzed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analyzedCoins.length}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">High Score (≥70)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{highScoreCoins.length}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Processing</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {coins?.filter(coin => coin.status === 'processing').length || 0}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Coins Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Recent Coin Analysis
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4">Coin</th>
                  <th className="text-left py-3 px-4">Score</th>
                  <th className="text-left py-3 px-4">Confidence</th>
                  <th className="text-left py-3 px-4">Pillars</th>
                  <th className="text-left py-3 px-4">Flags</th>
                  <th className="text-left py-3 px-4">Status</th>
                  <th className="text-left py-3 px-4">First Seen</th>
                  <th className="text-left py-3 px-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {coins?.map((coin) => {
                  const latestScore = coin.scores?.[0];
                  
                  return (
                    <tr key={coin.id} className="border-b hover:bg-muted/50">
                      <td className="py-3 px-4">
                        <div>
                          <div className="font-medium">{coin.name}</div>
                          <div className="text-sm text-muted-foreground">{coin.symbol}</div>
                        </div>
                      </td>
                      
                      <td className="py-3 px-4">
                        {latestScore ? (
                          <div className={`text-lg font-bold ${getScoreColor(latestScore.overall)}`}>
                            {latestScore.overall}/100
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                      
                      <td className="py-3 px-4">
                        {latestScore ? (
                          <div className="flex items-center gap-2">
                            <Progress value={latestScore.confidence * 100} className="w-16" />
                            <span className="text-sm">{Math.round(latestScore.confidence * 100)}%</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                      
                      <td className="py-3 px-4">
                        {latestScore?.pillars ? (
                          <div className="flex flex-wrap gap-1">
                            {Object.entries(latestScore.pillars).map(([key, value]) => (
                              <Badge key={key} variant="outline" className="text-xs">
                                {key.split('_')[0]}: {Math.round(value as number)}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                      
                      <td className="py-3 px-4">
                        <div className="flex flex-col gap-1">
                          {latestScore?.red_flags?.map((flag, i) => (
                            <Badge key={i} variant="destructive" className="text-xs">
                              🚩 {flag.substring(0, 20)}...
                            </Badge>
                          ))}
                          {latestScore?.green_flags?.map((flag, i) => (
                            <Badge key={i} variant="default" className="text-xs bg-green-100">
                              ✅ {flag.substring(0, 20)}...
                            </Badge>
                          ))}
                        </div>
                      </td>
                      
                      <td className="py-3 px-4">
                        <Badge className={`text-white ${getStatusColor(coin.status)}`}>
                          {coin.status}
                        </Badge>
                      </td>
                      
                      <td className="py-3 px-4">
                        <div className="text-sm">
                          {new Date(coin.first_seen).toLocaleDateString()}
                        </div>
                      </td>
                      
                      <td className="py-3 px-4">
                        <Link to={`/coin/${coin.id}`}>
                          <Button variant="ghost" size="sm">
                            <ExternalLink className="w-4 h-4" />
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            
            {!coins?.length && (
              <div className="text-center py-8 text-muted-foreground">
                No coins found. Run the analysis pipeline to discover new projects.
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Dashboard;