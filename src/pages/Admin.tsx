import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import Navigation from '@/components/Navigation';
import LoadingSpinner from '@/components/LoadingSpinner';

interface WeightsConfig {
  security_rug_pull: number;
  tokenomics: number;
  team_transparency: number;
  product_roadmap: number;
  onchain_traction: number;
  market_narrative: number;
  community: number;
}

const Admin = () => {
  const queryClient = useQueryClient();
  const [weights, setWeights] = useState<WeightsConfig>({
    security_rug_pull: 15,
    tokenomics: 10,
    team_transparency: 20,
    product_roadmap: 20,
    onchain_traction: 10,
    market_narrative: 15,
    community: 10,
  });

  const { data: settings, isLoading } = useQuery({
    queryKey: ['admin-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('settings')
        .select('*')
        .single();
      
      if (error) throw error;
      return data;
    }
  });

  // Update local state when settings data loads
  React.useEffect(() => {
    if (settings?.weights_json && typeof settings.weights_json === 'object') {
      setWeights(settings.weights_json as unknown as WeightsConfig);
    }
  }, [settings]);

  const updateSettings = useMutation({
    mutationFn: async (newWeights: WeightsConfig) => {
      const { data, error } = await supabase
        .from('settings')
        .update({
          weights_json: newWeights as any,
          updated_at: new Date().toISOString()
        })
        .eq('id', 1);
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success('Scoring weights updated successfully');
      queryClient.invalidateQueries({ queryKey: ['admin-settings'] });
    },
    onError: (error) => {
      toast.error(`Failed to update weights: ${error.message}`);
    }
  });

  const handleWeightChange = (key: keyof WeightsConfig, value: number[]) => {
    setWeights(prev => ({
      ...prev,
      [key]: value[0]
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const totalWeight = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
    if (totalWeight !== 100) {
      toast.error(`Total weights must equal 100. Current total: ${totalWeight}`);
      return;
    }

    updateSettings.mutate(weights);
  };

  const resetToDefaults = () => {
    const defaultWeights = {
      security_rug_pull: 15,
      tokenomics: 10,
      team_transparency: 20,
      product_roadmap: 20,
      onchain_traction: 10,
      market_narrative: 15,
      community: 10,
    };
    setWeights(defaultWeights);
  };

  const getTotalWeight = () => {
    return Object.values(weights).reduce((sum, weight) => sum + weight, 0);
  };

  const getWeightColor = () => {
    const total = getTotalWeight();
    if (total === 100) return 'text-success';
    if (total > 100) return 'text-destructive';
    return 'text-warning';
  };

  if (isLoading) {
    return (
      <>
        <Navigation />
        <div className="flex items-center justify-center min-h-[80vh] flex-col gap-4">
          <LoadingSpinner size="lg" />
          <p className="text-muted-foreground">Loading admin settings...</p>
        </div>
      </>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Admin Panel</h1>
          <p className="text-muted-foreground">
            Configure scoring weights and system settings
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                Scoring Weights Configuration
                <div className={`text-lg font-bold ${getWeightColor()}`}>
                  Total: {getTotalWeight()}%
                </div>
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Adjust the weight percentages for each scoring pillar. Total must equal 100%.
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              {Object.entries(weights).map(([key, value]) => {
                const label = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                
                return (
                  <div key={key} className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label htmlFor={key} className="text-sm font-medium">
                        {label}
                      </Label>
                      <div className="flex items-center gap-4">
                        <span className="text-sm font-mono text-muted-foreground w-8">
                          {value}%
                        </span>
                        <Input
                          type="number"
                          value={value}
                          onChange={(e) => handleWeightChange(key as keyof WeightsConfig, [parseInt(e.target.value) || 0])}
                          min="0"
                          max="50"
                          className="w-20"
                        />
                      </div>
                    </div>
                    <Slider
                      value={[value]}
                      onValueChange={(newValue) => handleWeightChange(key as keyof WeightsConfig, newValue)}
                      max={50}
                      step={1}
                      className="w-full"
                    />
                  </div>
                );
              })}
              
              <div className="pt-4 border-t">
                <div className="flex gap-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={resetToDefaults}
                  >
                    Reset to Defaults
                  </Button>
                  
                  <Button
                    type="submit"
                    disabled={getTotalWeight() !== 100 || updateSettings.isPending}
                    className="flex items-center gap-2"
                  >
                    {updateSettings.isPending && <LoadingSpinner size="sm" />}
                    Save Weights
                  </Button>
                </div>
                
                {getTotalWeight() !== 100 && (
                  <p className="text-sm text-destructive mt-2">
                    Weights must total exactly 100%. Current total: {getTotalWeight()}%
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </form>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Current Settings</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Hybrid Mode:</span>
                <span className="font-mono">{(settings as any)?.hybrid_mode ? 'Enabled' : 'Disabled'}</span>
              </div>
              <div className="flex justify-between">
                <span>Strategy Version:</span>
                <span className="font-mono">{(settings as any)?.strategy_version}</span>
              </div>
              <div className="flex justify-between">
                <span>Allowed Domains:</span>
                <span className="font-mono text-xs">
                  {(settings as any)?.allow_domains?.join(', ')}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Last Updated:</span>
                <span className="font-mono text-xs">
                  {(settings as any)?.updated_at ? new Date((settings as any).updated_at).toLocaleString() : 'Never'}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Admin;