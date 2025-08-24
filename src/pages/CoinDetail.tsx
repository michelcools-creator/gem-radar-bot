import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ArrowLeft, ExternalLink, Users, Shield, Rocket, TrendingUp, MessageCircle, Coins, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import Navigation from '@/components/Navigation';
import LoadingSpinner from '@/components/LoadingSpinner';
import ScoreHistoryChart from '@/components/ScoreHistoryChart';
import AnalysisPipelineFlow from '@/components/AnalysisPipelineFlow';
import { EvidenceViewer } from '@/components/EvidenceViewer';

const CoinDetail = () => {
  const { id } = useParams();
  const queryClient = useQueryClient();
  
  const { data: coinData, isLoading } = useQuery({
    queryKey: ['coin', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('coins')
        .select(`
          *,
          scores(*),
          facts(*),
          pages(*),
          deep_analysis(*)
        `)
        .eq('id', id)
        .single();
      
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Use a separate useEffect for auto-refresh when status is processing
  React.useEffect(() => {
    if (coinData?.status === 'processing') {
      const interval = setInterval(() => {
        queryClient.invalidateQueries({ queryKey: ['coin', id] });
      }, 3000);
      
      return () => clearInterval(interval);
    }
  }, [coinData?.status, queryClient, id]);

  if (isLoading) {
    return (
      <>
        <Navigation />
        <div className="flex items-center justify-center min-h-[80vh] flex-col gap-4">
          <LoadingSpinner size="lg" />
          <p className="text-muted-foreground">Loading coin details...</p>
        </div>
      </>
    );
  }

  if (!coinData) {
    return (
      <>
        <Navigation />
        <div className="container mx-auto px-4 py-8">
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-4">Coin not found</h1>
            <Link to="/">
              <Button>Back to Dashboard</Button>
            </Link>
          </div>
        </div>
      </>
    );
  }

  const latestScore = coinData.scores?.[0];
  const latestFacts = coinData.facts?.[0]?.extracted as any;
  const latestDeepAnalysis = coinData.deep_analysis?.[0] as any;
  const officialLinks = coinData.official_links as Record<string, string>;

  const getPillarIcon = (pillar: string) => {
    const icons = {
      security_rug_pull: Shield,
      team_transparency: Users,
      product_roadmap: Rocket,
      tokenomics: Coins,
      market_narrative: TrendingUp,
      community: MessageCircle,
    };
    return icons[pillar as keyof typeof icons] || Shield;
  };

  const getScoreColor = (score: number) => {
    if (score >= 70) return 'text-green-600 bg-green-50';
    if (score >= 50) return 'text-yellow-600 bg-yellow-50';
    return 'text-red-600 bg-red-50';
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      
      <div className="container mx-auto px-4 py-8 max-w-6xl">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link to="/">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Button>
        </Link>
        
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold">{coinData.name}</h1>
            <Badge variant="outline" className="text-lg px-3 py-1">
              {coinData.symbol}
            </Badge>
          </div>
          <p className="text-muted-foreground">
            First seen: {new Date(coinData.first_seen).toLocaleDateString()}
          </p>
        </div>
        
        {latestScore && (
          <div className={`rounded-lg p-4 ${getScoreColor(latestScore.overall)}`}>
            <div className="text-center">
              <div className="text-3xl font-bold">{latestScore.overall}/100</div>
              <div className="text-sm">Overall Score</div>
            </div>
          </div>
        )}
      </div>

      {/* Analysis Pipeline Flow */}
      {coinData.status !== 'analyzed' && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Analysis Pipeline Progress</CardTitle>
            <p className="text-sm text-muted-foreground">
              Real-time view of where your coin is in the analysis process
            </p>
          </CardHeader>
          <CardContent>
            <AnalysisPipelineFlow coinData={coinData} />
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Score Details */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Score History Chart */}
          {latestScore && (
            <Card>
              <CardHeader>
                <CardTitle>Score History</CardTitle>
              </CardHeader>
              <CardContent>
                <ScoreHistoryChart data={coinData.scores} />
              </CardContent>
            </Card>
          )}
          
          {/* Pillars Breakdown */}
          {latestScore && (
            <Card>
              <CardHeader>
                <CardTitle>Score Breakdown</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {Object.entries(latestScore.pillars as Record<string, number>).map(([pillar, score]) => {
                  const Icon = getPillarIcon(pillar);
                  const maxScore = pillar === 'team_transparency' || pillar === 'product_roadmap' ? 20 : 
                                 pillar === 'security_rug_pull' || pillar === 'market_narrative' ? 15 : 10;
                  
                  return (
                    <div key={pillar} className="flex items-center gap-4">
                      <Icon className="w-5 h-5 text-muted-foreground" />
                      <div className="flex-1">
                        <div className="flex justify-between mb-1">
                          <span className="capitalize text-sm font-medium">
                            {pillar.replace(/_/g, ' ')}
                          </span>
                          <span className="text-sm font-bold">{score}/{maxScore}</span>
                        </div>
                        <Progress value={(score / maxScore) * 100} className="h-2" />
                      </div>
                    </div>
                  );
                })}
                
                <div className="pt-4 border-t">
                  <div className="flex justify-between items-center">
                    <span>Confidence Level</span>
                    <div className="flex items-center gap-2">
                      <Progress value={latestScore.confidence * 100} className="w-20" />
                      <span className="font-bold">{Math.round(latestScore.confidence * 100)}%</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Flags */}
          {latestScore && ((latestScore.red_flags as any[])?.length > 0 || (latestScore.green_flags as any[])?.length > 0) && (
            <Card>
              <CardHeader>
                <CardTitle>Analysis Flags</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {(latestScore.red_flags as any[])?.map((flag, i) => (
                    <div key={i} className="flex items-start gap-3 p-3 bg-red-50 rounded-lg">
                      <span className="text-red-500 mt-0.5">🚩</span>
                      <span className="text-red-700 text-sm">{flag}</span>
                    </div>
                  ))}
                  
                  {(latestScore.green_flags as any[])?.map((flag, i) => (
                    <div key={i} className="flex items-start gap-3 p-3 bg-green-50 rounded-lg">
                      <span className="text-green-500 mt-0.5">✅</span>
                      <span className="text-green-700 text-sm">{flag}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Evidence Viewer 2.0 - New Claims-based Structure */}
          {latestFacts?.claims && (
            <EvidenceViewer
              claims={latestFacts.claims}
              redFlags={latestFacts.red_flags || {}}
              contradictions={latestFacts.contradictions}
              overallCap={latestScore?.overall_cap}
            />
          )}

          {/* Extracted Facts */}
          {latestFacts && !latestFacts.claims && (
            <Card>
              <CardHeader>
                <CardTitle>Extracted Information</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  
                  {/* Team */}
                  {latestFacts.team && (
                    <div>
                      <h4 className="font-semibold mb-2 flex items-center gap-2">
                        <Users className="w-4 h-4" />
                        Team & Leadership
                      </h4>
                      <div className="space-y-2 ml-6">
                        <p><strong>Doxxed:</strong> {latestFacts.team.doxxed?.toString()}</p>
                        {latestFacts.team.members?.map((member: any, i: number) => (
                          <div key={i} className="text-sm">
                            <strong>{member.name}</strong> - {member.role}
                            {member.proof_url && (
                              <a href={member.proof_url} target="_blank" rel="noopener noreferrer" className="ml-2 text-primary">
                                <ExternalLink className="w-3 h-3 inline" />
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Tokenomics */}
                  {latestFacts.tokenomics && (
                    <div>
                      <h4 className="font-semibold mb-2 flex items-center gap-2">
                        <Coins className="w-4 h-4" />
                        Tokenomics
                      </h4>
                      <div className="space-y-1 ml-6 text-sm">
                        {latestFacts.tokenomics.supply && (
                          <p><strong>Supply:</strong> {latestFacts.tokenomics.supply}</p>
                        )}
                        {latestFacts.tokenomics.vesting && (
                          <p><strong>Vesting:</strong> {latestFacts.tokenomics.vesting}</p>
                        )}
                        {latestFacts.tokenomics.utility && (
                          <p><strong>Utility:</strong> {latestFacts.tokenomics.utility}</p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Product */}
                  {latestFacts.product && (
                    <div>
                      <h4 className="font-semibold mb-2 flex items-center gap-2">
                        <Rocket className="w-4 h-4" />
                        Product & Roadmap
                      </h4>
                      <div className="space-y-1 ml-6 text-sm">
                        <p><strong>MVP:</strong> {latestFacts.product.mvp}</p>
                        {latestFacts.product.roadmap_items?.map((item: any, i: number) => (
                          <div key={i}>
                            <strong>{item.milestone}</strong> - {item.date}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                </div>
              </CardContent>
            </Card>
          )}

          {/* Deep Analysis Results */}
          {latestDeepAnalysis && (
            <Card>
              <CardHeader>
                <CardTitle>🔍 Deep Dive Analysis</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Comprehensive research and due diligence findings
                </p>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  
                  {/* Team Deep Dive */}
                  {latestDeepAnalysis.team_deep_dive && (
                    <div>
                      <h4 className="font-semibold mb-2 flex items-center gap-2">
                        <Users className="w-4 h-4" />
                        Team Analysis (Credibility: {latestDeepAnalysis.team_deep_dive.credibility_score}/100)
                      </h4>
                      <div className="ml-6 space-y-2">
                        <p className="text-sm">{latestDeepAnalysis.team_deep_dive.analysis}</p>
                        {latestDeepAnalysis.team_deep_dive.key_findings?.length > 0 && (
                          <div>
                            <strong className="text-sm">Key Findings:</strong>
                            <ul className="list-disc list-inside text-sm ml-2 space-y-1">
                              {latestDeepAnalysis.team_deep_dive.key_findings.map((finding: string, i: number) => (
                                <li key={i}>{finding}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {latestDeepAnalysis.team_deep_dive.red_flags?.length > 0 && (
                          <div>
                            <strong className="text-sm text-red-600">Red Flags:</strong>
                            <ul className="list-disc list-inside text-sm ml-2 space-y-1 text-red-600">
                              {latestDeepAnalysis.team_deep_dive.red_flags.map((flag: string, i: number) => (
                                <li key={i}>{flag}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Partnership Analysis */}
                  {latestDeepAnalysis.partnership_analysis && (
                    <div>
                      <h4 className="font-semibold mb-2 flex items-center gap-2">
                        <TrendingUp className="w-4 h-4" />
                        Partnership Analysis (Legitimacy: {latestDeepAnalysis.partnership_analysis.legitimacy_score}/100)
                      </h4>
                      <div className="ml-6 space-y-2">
                        <p className="text-sm">{latestDeepAnalysis.partnership_analysis.analysis}</p>
                        {latestDeepAnalysis.partnership_analysis.verified_partnerships?.length > 0 && (
                          <div>
                            <strong className="text-sm text-green-600">Verified Partnerships:</strong>
                            <ul className="list-disc list-inside text-sm ml-2 space-y-1 text-green-600">
                              {latestDeepAnalysis.partnership_analysis.verified_partnerships.map((partner: string, i: number) => (
                                <li key={i}>{partner}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {latestDeepAnalysis.partnership_analysis.questionable_claims?.length > 0 && (
                          <div>
                            <strong className="text-sm text-yellow-600">Questionable Claims:</strong>
                            <ul className="list-disc list-inside text-sm ml-2 space-y-1 text-yellow-600">
                              {latestDeepAnalysis.partnership_analysis.questionable_claims.map((claim: string, i: number) => (
                                <li key={i}>{claim}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Competitor Analysis */}
                  {latestDeepAnalysis.competitor_analysis && (
                    <div>
                      <h4 className="font-semibold mb-2 flex items-center gap-2">
                        <Shield className="w-4 h-4" />
                        Competitor Analysis (Position: {latestDeepAnalysis.competitor_analysis.competitive_score}/100)
                      </h4>
                      <div className="ml-6 space-y-2">
                        <p className="text-sm">{latestDeepAnalysis.competitor_analysis.analysis}</p>
                        {latestDeepAnalysis.competitor_analysis.main_competitors?.length > 0 && (
                          <p className="text-sm">
                            <strong>Main Competitors:</strong> {latestDeepAnalysis.competitor_analysis.main_competitors.join(', ')}
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Red Flag Analysis */}
                  {latestDeepAnalysis.red_flag_analysis && (
                    <div>
                      <h4 className="font-semibold mb-2 flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-red-500" />
                        Risk Assessment (Risk Score: {latestDeepAnalysis.red_flag_analysis.risk_score}/100)
                      </h4>
                      <div className="ml-6 space-y-2">
                        <p className="text-sm">{latestDeepAnalysis.red_flag_analysis.analysis}</p>
                        {latestDeepAnalysis.red_flag_analysis.critical_flags?.length > 0 && (
                          <div>
                            <strong className="text-sm text-red-600">Critical Flags:</strong>
                            <ul className="list-disc list-inside text-sm ml-2 space-y-1 text-red-600">
                              {latestDeepAnalysis.red_flag_analysis.critical_flags.map((flag: string, i: number) => (
                                <li key={i}>{flag}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {latestDeepAnalysis.red_flag_analysis.minor_concerns?.length > 0 && (
                          <div>
                            <strong className="text-sm text-yellow-600">Minor Concerns:</strong>
                            <ul className="list-disc list-inside text-sm ml-2 space-y-1 text-yellow-600">
                              {latestDeepAnalysis.red_flag_analysis.minor_concerns.map((concern: string, i: number) => (
                                <li key={i}>{concern}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Social Sentiment */}
                  {latestDeepAnalysis.social_sentiment && (
                    <div>
                      <h4 className="font-semibold mb-2 flex items-center gap-2">
                        <MessageCircle className="w-4 h-4" />
                        Social Sentiment (Authenticity: {latestDeepAnalysis.social_sentiment.authenticity_score}/100)
                      </h4>
                      <div className="ml-6 space-y-2">
                        <p className="text-sm">{latestDeepAnalysis.social_sentiment.analysis}</p>
                        <div className="flex gap-4 text-sm">
                          <span><strong>Engagement:</strong> {latestDeepAnalysis.social_sentiment.engagement_quality}</span>
                          <span><strong>Trend:</strong> {latestDeepAnalysis.social_sentiment.sentiment_trend}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Financial Deep Dive */}
                  {latestDeepAnalysis.financial_deep_dive && (
                    <div>
                      <h4 className="font-semibold mb-2 flex items-center gap-2">
                        <Coins className="w-4 h-4" />
                        Financial Analysis (Health: {latestDeepAnalysis.financial_deep_dive.health_score}/100)
                      </h4>
                      <div className="ml-6 space-y-2">
                        <p className="text-sm">{latestDeepAnalysis.financial_deep_dive.analysis}</p>
                        <div className="flex gap-4 text-sm">
                          <span><strong>Transparency:</strong> {latestDeepAnalysis.financial_deep_dive.transparency_rating}</span>
                        </div>
                        {latestDeepAnalysis.financial_deep_dive.risk_factors?.length > 0 && (
                          <div>
                            <strong className="text-sm text-orange-600">Risk Factors:</strong>
                            <ul className="list-disc list-inside text-sm ml-2 space-y-1 text-orange-600">
                              {latestDeepAnalysis.financial_deep_dive.risk_factors.map((risk: string, i: number) => (
                                <li key={i}>{risk}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Column - Quick Info */}
        <div className="space-y-6">
          
          {/* Official Links */}
          {Object.keys(officialLinks).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Official Links</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {Object.entries(officialLinks).map(([type, url]) => (
                    <a
                      key={type}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50"
                    >
                      <span className="capitalize font-medium">{type}</span>
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Status & Meta */}
          <Card>
            <CardHeader>
              <CardTitle>Analysis Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span>Status:</span>
                  <Badge className={coinData.status === 'analyzed' ? 'bg-green-500' : 'bg-yellow-500'}>
                    {coinData.status}
                  </Badge>
                </div>
                
                <div className="flex justify-between">
                  <span>Pages Analyzed:</span>
                  <span className="font-medium">{coinData.pages?.length || 0}</span>
                </div>
                
                {latestScore && (
                  <div className="flex justify-between">
                    <span>Last Analyzed:</span>
                    <span className="font-medium">
                      {new Date(latestScore.as_of).toLocaleDateString()}
                    </span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* CoinGecko Link */}
          {coinData.coingecko_coin_url && (
            <Card>
              <CardHeader>
                <CardTitle>External Resources</CardTitle>
              </CardHeader>
              <CardContent>
                <a
                  href={coinData.coingecko_coin_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50"
                >
                  <span>View on CoinGecko</span>
                  <ExternalLink className="w-4 h-4" />
                </a>
              </CardContent>
            </Card>
          )}

        </div>
      </div>
      </div>
    </div>
  );
};

export default CoinDetail;