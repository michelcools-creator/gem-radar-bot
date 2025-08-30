import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { AlertCircle, TrendingUp, RefreshCw, ExternalLink, Search, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Link } from 'react-router-dom';
import Navigation from '@/components/Navigation';
import LoadingSpinner from '@/components/LoadingSpinner';

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
    overall_cap?: number | null;
    penalties?: number;
  }[];
}

const Dashboard = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isRunning, setIsRunning] = useState(false);
  const [manualUrl, setManualUrl] = useState('');
  const [isAnalyzingManual, setIsAnalyzingManual] = useState(false);
  const [deletingCoinId, setDeletingCoinId] = useState<string | null>(null);

  const { data: coins, isLoading } = useQuery({
    queryKey: ['coins'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('coins')
        .select(`
          id, name, symbol, first_seen, status,
          scores:scores(overall, confidence, pillars, red_flags, green_flags, overall_cap, penalties)
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

  const analyzeManualCoin = useMutation({
    mutationFn: async (url: string) => {
      setIsAnalyzingManual(true);
      const { data, error } = await supabase.functions.invoke('pipeline-run', {
        body: { manual_url: url }
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast({
        title: "Manual Analysis Started",
        description: "Analyzing the specified coin. Results will appear shortly.",
      });
      setManualUrl('');
      queryClient.invalidateQueries({ queryKey: ['coins'] });
    },
    onError: (error: any) => {
      toast({
        title: "Analysis Error",
        description: error.message || "Failed to analyze coin",
        variant: "destructive",
      });
    },
    onSettled: () => {
      setIsAnalyzingManual(false);
    }
  });

  const validateCoinGeckoUrl = (url: string) => {
    const regex = /^https?:\/\/(www\.)?coingecko\.com\/[a-z]{2}\/coins\/[a-zA-Z0-9-_]+$/;
    return regex.test(url);
  };

  const handleManualAnalysis = () => {
    if (!manualUrl.trim()) {
      toast({
        title: "URL Required",
        description: "Please enter a CoinGecko coin URL",
        variant: "destructive",
      });
      return;
    }

    if (!validateCoinGeckoUrl(manualUrl)) {
      toast({
        title: "Invalid URL",
        description: "Please enter a valid CoinGecko coin URL (e.g., https://www.coingecko.com/en/coins/bitcoin)",
        variant: "destructive",
      });
      return;
    }

    analyzeManualCoin.mutate(manualUrl);
  };

  const deleteCoin = useMutation({
    mutationFn: async (coinId: string) => {
      setDeletingCoinId(coinId);
      
      // Delete related data first (scores, facts, pages)
      await supabase.from('scores').delete().eq('coin_id', coinId);
      await supabase.from('facts').delete().eq('coin_id', coinId);
      await supabase.from('pages').delete().eq('coin_id', coinId);
      
      // Then delete the coin
      const { error } = await supabase.from('coins').delete().eq('id', coinId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: "Coin Deleted",
        description: "The coin and all related data have been removed.",
      });
      queryClient.invalidateQueries({ queryKey: ['coins'] });
    },
    onError: (error: any) => {
      toast({
        title: "Delete Error",
        description: error.message || "Failed to delete coin",
        variant: "destructive",
      });
    },
    onSettled: () => {
      setDeletingCoinId(null);
    }
  });

  const getStatusColor = (status: string) => {
    const colors = {
      pending: 'bg-warning text-warning-foreground',
      processing: 'bg-primary text-primary-foreground animate-pulse',
      analyzed: 'bg-success text-success-foreground',
      failed: 'bg-destructive text-destructive-foreground',
      insufficient_data: 'bg-muted text-muted-foreground'
    };
    return colors[status as keyof typeof colors] || 'bg-muted text-muted-foreground';
  };

  const getScoreColor = (score: number) => {
    if (score >= 70) return 'text-success font-semibold';
    if (score >= 50) return 'text-warning font-medium';
    return 'text-destructive font-medium';
  };

  if (isLoading) {
    return (
      <>
        <Navigation />
        <div className="flex items-center justify-center min-h-[80vh]">
          <LoadingSpinner size="lg" />
        </div>
      </>
    );
  }

  const analyzedCoins = coins?.filter(coin => coin.scores?.length > 0) || [];
  const highScoreCoins = analyzedCoins.filter(coin => coin.scores?.[0]?.overall >= 70);

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      
      <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <div className="flex items-center space-x-3 mb-2">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-primary-glow shadow-lg"></div>
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-primary-glow bg-clip-text text-transparent">
                New-Coin Radar
              </h1>
              <p className="text-sm text-muted-foreground">Web-Only Research Tool</p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground mb-2">
            🔬 Research tool only - not investment advice. Respects robots.txt and rate limits.
          </p>
          <p className="text-muted-foreground">
            Analyzes new cryptocurrency projects using Web-Only scoring methodology
          </p>
        </div>
        <div className="flex flex-col gap-3 md:flex-row md:items-end">
          <div className="flex gap-2 flex-1">
            <div className="flex-1 max-w-md">
              <Input
                placeholder="https://www.coingecko.com/en/coins/bitcoin"
                value={manualUrl}
                onChange={(e) => setManualUrl(e.target.value)}
                className="border-primary/20 focus:border-primary/40"
              />
            </div>
            <Button
              variant="outline"
              onClick={handleManualAnalysis}
              disabled={isAnalyzingManual}
              className="border-primary/20 hover:border-primary/40 hover:bg-primary/5"
            >
              {isAnalyzingManual ? (
                <LoadingSpinner size="sm" className="mr-2" />
              ) : (
                <Search className="w-4 h-4 mr-2" />
              )}
              {isAnalyzingManual ? 'Analyzing...' : 'Analyze Coin'}
            </Button>
          </div>
          <Button
            variant="outline"
            onClick={() => runPipeline.mutate()}
            disabled={isRunning}
            className="border-primary/20 hover:border-primary/40 hover:bg-primary/5"
          >
            {isRunning ? (
              <LoadingSpinner size="sm" className="mr-2" />
            ) : (
              <TrendingUp className="w-4 h-4 mr-2" />
            )}
            {isRunning ? 'Running...' : 'Discover New Coins'}
          </Button>
        </div>
      </div>

      {/* Disclaimer */}
      <Alert className="mb-6 border-warning/20 bg-warning/5">
        <AlertCircle className="h-4 w-4 text-warning" />
        <AlertDescription>
          <strong>Research Only:</strong> This tool provides research insights based on web content analysis. 
          Not investment advice. Always do your own research before making investment decisions.
        </AlertDescription>
      </Alert>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <Card className="border-primary/20 bg-gradient-to-br from-card to-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Coins</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{coins?.length || 0}</div>
          </CardContent>
        </Card>
        
        <Card className="border-success/20 bg-gradient-to-br from-card to-success/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Analyzed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-success">{analyzedCoins.length}</div>
          </CardContent>
        </Card>
        
        <Card className="border-success/20 bg-gradient-to-br from-card to-success/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">High Score (≥70)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-success">{highScoreCoins.length}</div>
          </CardContent>
        </Card>
        
        <Card className="border-warning/20 bg-gradient-to-br from-card to-warning/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Processing</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-warning">
              {coins?.filter(coin => coin.status === 'processing').length || 0}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Coins Table */}
      <Card className="shadow-lg border-primary/10">
        <CardHeader className="bg-gradient-to-r from-primary/5 to-primary-glow/5">
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" />
            Recent Coin Analysis
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-primary/10">
                  <th className="text-left py-3 px-4 font-medium">Coin</th>
                  <th className="text-left py-3 px-4 font-medium">Score</th>
                  <th className="text-left py-3 px-4 font-medium">Confidence</th>
                  <th className="text-left py-3 px-4 font-medium">Pillars</th>
                  <th className="text-left py-3 px-4 font-medium">Flags</th>
                  <th className="text-left py-3 px-4 font-medium">Status</th>
                  <th className="text-left py-3 px-4 font-medium">First Seen</th>
                  <th className="text-left py-3 px-4 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {coins?.map((coin) => {
                  const latestScore = coin.scores?.[0];
                  
                  return (
                    <tr key={coin.id} className="border-b border-muted/30 hover:bg-primary/5 transition-colors">
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
                            <span className="text-sm font-medium">{Math.round(latestScore.confidence * 100)}%</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                      
                      <td className="py-3 px-4">
                        {latestScore?.pillars ? (
                          <div className="flex flex-wrap gap-1">
                            {Object.entries(latestScore.pillars).map(([key, value]) => (
                              <Badge key={key} variant="outline" className="text-xs border-primary/20">
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
                               🚩 {flag.substring(0, 30)}...
                             </Badge>
                           ))}
                           {latestScore?.green_flags?.map((flag, i) => (
                             <Badge key={i} className="text-xs bg-success text-success-foreground">
                               ✅ {flag.substring(0, 25)}...
                             </Badge>
                           ))}
                           {latestScore?.overall_cap && (
                             <Badge variant="destructive" className="text-xs bg-red-600 text-white">
                               🔒 CAP {latestScore.overall_cap}
                             </Badge>
                           )}
                           {latestScore?.penalties > 0 && (
                             <Badge variant="outline" className="text-xs border-red-300 text-red-600">
                               -{latestScore.penalties} pts
                             </Badge>
                           )}
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
                         <div className="flex gap-1">
                           <Link to={`/coin/${coin.id}`}>
                             <Button variant="ghost" size="sm" className="hover:bg-primary/10">
                               <ExternalLink className="w-4 h-4" />
                             </Button>
                           </Link>
                           
                           <AlertDialog>
                             <AlertDialogTrigger asChild>
                               <Button 
                                 variant="ghost" 
                                 size="sm" 
                                 className="hover:bg-destructive/10 hover:text-destructive"
                                 disabled={deletingCoinId === coin.id}
                               >
                                 <Trash2 className="w-4 h-4" />
                               </Button>
                             </AlertDialogTrigger>
                             <AlertDialogContent>
                               <AlertDialogHeader>
                                 <AlertDialogTitle>Verwijder {coin.name}</AlertDialogTitle>
                                 <AlertDialogDescription>
                                   Weet je zeker dat je deze coin wilt verwijderen? Deze actie kan niet ongedaan worden gemaakt. 
                                   Alle gerelateerde scores, feiten en pagina's worden ook verwijderd.
                                 </AlertDialogDescription>
                               </AlertDialogHeader>
                               <AlertDialogFooter>
                                 <AlertDialogCancel>Annuleren</AlertDialogCancel>
                                 <AlertDialogAction
                                   onClick={() => deleteCoin.mutate(coin.id)}
                                   className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                 >
                                   Verwijderen
                                 </AlertDialogAction>
                               </AlertDialogFooter>
                             </AlertDialogContent>
                           </AlertDialog>
                         </div>
                       </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            
            {!coins?.length && (
              <div className="text-center py-12 text-muted-foreground">
                <TrendingUp className="w-12 h-12 mx-auto mb-4 opacity-20" />
                <h3 className="text-lg font-medium mb-2">No coins found</h3>
                <p>Run the analysis pipeline to discover new projects.</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
      </div>
    </div>
  );
};

export default Dashboard;