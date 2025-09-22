'use client';

import React, { useState, useCallback } from 'react';
import { FestivalData, VenueData, TeacherData, MusicianData, PriceData } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Edit2, Save, X, Plus, Trash2, MapPin, Calendar, Users, Music, DollarSign } from 'lucide-react';
import { formatDate } from '@/lib/date-utils';

interface DataPreviewProps {
  data: FestivalData;
  onEdit: (editedData: FestivalData) => void;
  onSave: () => void;
  onCancel: () => void;
  isEditing?: boolean;
}

export function DataPreview({
  data,
  onEdit,
  onSave,
  onCancel,
  isEditing = false
}: DataPreviewProps) {
  const [editedData, setEditedData] = useState<FestivalData>(data);
  const [activeTab, setActiveTab] = useState('basic');

  const handleFieldChange = useCallback((field: keyof FestivalData, value: any) => {
    setEditedData(prev => ({
      ...prev,
      [field]: value
    }));
  }, []);

  const handleVenueChange = useCallback((field: keyof VenueData, value: any) => {
    setEditedData(prev => ({
      ...prev,
      venue: {
        ...prev.venue!,
        [field]: value
      }
    }));
  }, []);

  const handleTeacherChange = useCallback((index: number, field: keyof TeacherData, value: any) => {
    setEditedData(prev => ({
      ...prev,
      teachers: prev.teachers?.map((teacher, i) =>
        i === index ? { ...teacher, [field]: value } : teacher
      )
    }));
  }, []);

  const handleMusicianChange = useCallback((index: number, field: keyof MusicianData, value: any) => {
    setEditedData(prev => ({
      ...prev,
      musicians: prev.musicians?.map((musician, i) =>
        i === index ? { ...musician, [field]: value } : musician
      )
    }));
  }, []);

  const handlePriceChange = useCallback((index: number, field: keyof PriceData, value: any) => {
    setEditedData(prev => ({
      ...prev,
      prices: prev.prices?.map((price, i) =>
        i === index ? { ...price, [field]: value } : price
      )
    }));
  }, []);

  const addTeacher = useCallback(() => {
    setEditedData(prev => ({
      ...prev,
      teachers: [...(prev.teachers || []), { name: '', specialties: [] }]
    }));
  }, []);

  const addMusician = useCallback(() => {
    setEditedData(prev => ({
      ...prev,
      musicians: [...(prev.musicians || []), { name: '', genre: [] }]
    }));
  }, []);

  const addPrice = useCallback(() => {
    setEditedData(prev => ({
      ...prev,
      prices: [...(prev.prices || []), { type: '', amount: 0, currency: 'USD' }]
    }));
  }, []);

  const removeTeacher = useCallback((index: number) => {
    setEditedData(prev => ({
      ...prev,
      teachers: prev.teachers?.filter((_, i) => i !== index)
    }));
  }, []);

  const removeMusician = useCallback((index: number) => {
    setEditedData(prev => ({
      ...prev,
      musicians: prev.musicians?.filter((_, i) => i !== index)
    }));
  }, []);

  const removePrice = useCallback((index: number) => {
    setEditedData(prev => ({
      ...prev,
      prices: prev.prices?.filter((_, i) => i !== index)
    }));
  }, []);

  const handleSave = useCallback(() => {
    onEdit(editedData);
    onSave();
  }, [editedData, onEdit, onSave]);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Data Preview</h2>
        <div className="flex gap-2">
          {!isEditing ? (
            <Button onClick={() => onEdit(editedData)} variant="outline">
              <Edit2 className="w-4 h-4 mr-2" />
              Edit
            </Button>
          ) : (
            <>
              <Button onClick={handleSave}>
                <Save className="w-4 h-4 mr-2" />
                Save
              </Button>
              <Button onClick={onCancel} variant="outline">
                <X className="w-4 h-4 mr-2" />
                Cancel
              </Button>
            </>
          )}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="basic">Basic Info</TabsTrigger>
          <TabsTrigger value="venue">Venue</TabsTrigger>
          <TabsTrigger value="people">People</TabsTrigger>
          <TabsTrigger value="pricing">Pricing</TabsTrigger>
          <TabsTrigger value="tags">Tags</TabsTrigger>
        </TabsList>

        <TabsContent value="basic" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                Basic Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="name">Festival Name</Label>
                  {isEditing ? (
                    <Input
                      id="name"
                      value={editedData.name}
                      onChange={(e) => handleFieldChange('name', e.target.value)}
                    />
                  ) : (
                    <p className="text-lg font-semibold">{editedData.name}</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="website">Website</Label>
                  {isEditing ? (
                    <Input
                      id="website"
                      value={editedData.website || ''}
                      onChange={(e) => handleFieldChange('website', e.target.value)}
                    />
                  ) : (
                    <a
                      href={editedData.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      {editedData.website || 'Not provided'}
                    </a>
                  )}
                </div>
              </div>

              <div>
                <Label htmlFor="description">Description</Label>
                {isEditing ? (
                  <Textarea
                    id="description"
                    value={editedData.description || ''}
                    onChange={(e) => handleFieldChange('description', e.target.value)}
                    rows={4}
                  />
                ) : (
                  <p className="text-gray-700">{editedData.description || 'No description provided'}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="startDate">Start Date</Label>
                  {isEditing ? (
                    <Input
                      id="startDate"
                      type="date"
                      value={formatDate(editedData.startDate, 'yyyy-MM-dd')}
                      onChange={(e) => handleFieldChange('startDate', new Date(e.target.value))}
                    />
                  ) : (
                    <p>{formatDate(editedData.startDate, 'PPP')}</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="endDate">End Date</Label>
                  {isEditing ? (
                    <Input
                      id="endDate"
                      type="date"
                      value={formatDate(editedData.endDate, 'yyyy-MM-dd')}
                      onChange={(e) => handleFieldChange('endDate', new Date(e.target.value))}
                    />
                  ) : (
                    <p>{formatDate(editedData.endDate, 'PPP')}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="email">Email</Label>
                  {isEditing ? (
                    <Input
                      id="email"
                      type="email"
                      value={editedData.email || ''}
                      onChange={(e) => handleFieldChange('email', e.target.value)}
                    />
                  ) : (
                    <p>{editedData.email || 'Not provided'}</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="phone">Phone</Label>
                  {isEditing ? (
                    <Input
                      id="phone"
                      value={editedData.phone || ''}
                      onChange={(e) => handleFieldChange('phone', e.target.value)}
                    />
                  ) : (
                    <p>{editedData.phone || 'Not provided'}</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="sourceUrl">Source URL</Label>
                  {isEditing ? (
                    <Input
                      id="sourceUrl"
                      value={editedData.sourceUrl || ''}
                      onChange={(e) => handleFieldChange('sourceUrl', e.target.value)}
                    />
                  ) : (
                    <a
                      href={editedData.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline text-sm"
                    >
                      View Source
                    </a>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="venue" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="w-5 h-5" />
                Venue Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {editedData.venue ? (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="venueName">Venue Name</Label>
                      {isEditing ? (
                        <Input
                          id="venueName"
                          value={editedData.venue.name}
                          onChange={(e) => handleVenueChange('name', e.target.value)}
                        />
                      ) : (
                        <p className="font-semibold">{editedData.venue.name}</p>
                      )}
                    </div>
                    <div>
                      <Label htmlFor="city">City</Label>
                      {isEditing ? (
                        <Input
                          id="city"
                          value={editedData.venue.city || ''}
                          onChange={(e) => handleVenueChange('city', e.target.value)}
                        />
                      ) : (
                        <p>{editedData.venue.city || 'Not provided'}</p>
                      )}
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="address">Address</Label>
                    {isEditing ? (
                      <Textarea
                        id="address"
                        value={editedData.venue.address || ''}
                        onChange={(e) => handleVenueChange('address', e.target.value)}
                        rows={2}
                      />
                    ) : (
                      <p>{editedData.venue.address || 'No address provided'}</p>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label htmlFor="state">State</Label>
                      {isEditing ? (
                        <Input
                          id="state"
                          value={editedData.venue.state || ''}
                          onChange={(e) => handleVenueChange('state', e.target.value)}
                        />
                      ) : (
                        <p>{editedData.venue.state || 'Not provided'}</p>
                      )}
                    </div>
                    <div>
                      <Label htmlFor="country">Country</Label>
                      {isEditing ? (
                        <Input
                          id="country"
                          value={editedData.venue.country || ''}
                          onChange={(e) => handleVenueChange('country', e.target.value)}
                        />
                      ) : (
                        <p>{editedData.venue.country || 'Not provided'}</p>
                      )}
                    </div>
                    <div>
                      <Label htmlFor="postalCode">Postal Code</Label>
                      {isEditing ? (
                        <Input
                          id="postalCode"
                          value={editedData.venue.postalCode || ''}
                          onChange={(e) => handleVenueChange('postalCode', e.target.value)}
                        />
                      ) : (
                        <p>{editedData.venue.postalCode || 'Not provided'}</p>
                      )}
                    </div>
                  </div>

                  {editedData.venue.latitude && editedData.venue.longitude && (
                    <div className="text-sm text-gray-600">
                      Coordinates: {editedData.venue.latitude.toFixed(4)}, {editedData.venue.longitude.toFixed(4)}
                    </div>
                  )}
                </>
              ) : (
                <p className="text-gray-500">No venue information available</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="people" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  Teachers
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {editedData.teachers?.map((teacher, index) => (
                    <div key={index} className="border rounded p-3 space-y-2">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <Label htmlFor={`teacher-${index}`}>Teacher Name</Label>
                          {isEditing ? (
                            <Input
                              id={`teacher-${index}`}
                              value={teacher.name}
                              onChange={(e) => handleTeacherChange(index, 'name', e.target.value)}
                            />
                          ) : (
                            <p className="font-medium">{teacher.name}</p>
                          )}
                        </div>
                        {isEditing && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeTeacher(index)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>

                      {teacher.specialties && teacher.specialties.length > 0 && (
                        <div>
                          <Label>Specialties</Label>
                          <div className="flex flex-wrap gap-1">
                            {teacher.specialties.map((specialty, idx) => (
                              <Badge key={idx} variant="secondary">
                                {specialty}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}

                  {isEditing && (
                    <Button variant="outline" onClick={addTeacher} className="w-full">
                      <Plus className="w-4 h-4 mr-2" />
                      Add Teacher
                    </Button>
                  )}

                  {!editedData.teachers?.length && !isEditing && (
                    <p className="text-gray-500">No teachers listed</p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Music className="w-5 h-5" />
                  Musicians
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {editedData.musicians?.map((musician, index) => (
                    <div key={index} className="border rounded p-3 space-y-2">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <Label htmlFor={`musician-${index}`}>Musician Name</Label>
                          {isEditing ? (
                            <Input
                              id={`musician-${index}`}
                              value={musician.name}
                              onChange={(e) => handleMusicianChange(index, 'name', e.target.value)}
                            />
                          ) : (
                            <p className="font-medium">{musician.name}</p>
                          )}
                        </div>
                        {isEditing && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeMusician(index)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>

                      {musician.genre && musician.genre.length > 0 && (
                        <div>
                          <Label>Genres</Label>
                          <div className="flex flex-wrap gap-1">
                            {musician.genre.map((genre, idx) => (
                              <Badge key={idx} variant="secondary">
                                {genre}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}

                  {isEditing && (
                    <Button variant="outline" onClick={addMusician} className="w-full">
                      <Plus className="w-4 h-4 mr-2" />
                      Add Musician
                    </Button>
                  )}

                  {!editedData.musicians?.length && !isEditing && (
                    <p className="text-gray-500">No musicians listed</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="pricing" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="w-5 h-5" />
                Pricing Information
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {editedData.prices?.map((price, index) => (
                  <div key={index} className="border rounded p-3 space-y-2">
                    <div className="flex justify-between items-start">
                      <div className="flex-1 grid grid-cols-3 gap-2">
                        <div>
                          <Label htmlFor={`price-type-${index}`}>Type</Label>
                          {isEditing ? (
                            <Input
                              id={`price-type-${index}`}
                              value={price.type}
                              onChange={(e) => handlePriceChange(index, 'type', e.target.value)}
                            />
                          ) : (
                            <p className="font-medium">{price.type}</p>
                          )}
                        </div>
                        <div>
                          <Label htmlFor={`price-amount-${index}`}>Amount</Label>
                          {isEditing ? (
                            <Input
                              id={`price-amount-${index}`}
                              type="number"
                              value={price.amount}
                              onChange={(e) => handlePriceChange(index, 'amount', parseFloat(e.target.value))}
                            />
                          ) : (
                            <p>{price.amount} {price.currency}</p>
                          )}
                        </div>
                        <div>
                          <Label htmlFor={`price-currency-${index}`}>Currency</Label>
                          {isEditing ? (
                            <Input
                              id={`price-currency-${index}`}
                              value={price.currency}
                              onChange={(e) => handlePriceChange(index, 'currency', e.target.value)}
                            />
                          ) : (
                            <p>{price.currency}</p>
                          )}
                        </div>
                      </div>
                      {isEditing && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removePrice(index)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>

                    {price.description && (
                      <div>
                        <Label>Description</Label>
                        {isEditing ? (
                          <Textarea
                            value={price.description}
                            onChange={(e) => handlePriceChange(index, 'description', e.target.value)}
                            rows={2}
                          />
                        ) : (
                          <p className="text-sm text-gray-600">{price.description}</p>
                        )}
                      </div>
                    )}

                    {price.deadline && (
                      <div>
                        <Label>Deadline</Label>
                        {isEditing ? (
                          <Input
                            type="date"
                            value={formatDate(price.deadline, 'yyyy-MM-dd')}
                            onChange={(e) => handlePriceChange(index, 'deadline', new Date(e.target.value))}
                          />
                        ) : (
                          <p className="text-sm text-gray-600">{formatDate(price.deadline, 'PPP')}</p>
                        )}
                      </div>
                    )}
                  </div>
                ))}

                {isEditing && (
                  <Button variant="outline" onClick={addPrice} className="w-full">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Price
                  </Button>
                )}

                {!editedData.prices?.length && !isEditing && (
                  <p className="text-gray-500">No pricing information available</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tags" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Tags</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {editedData.tags && editedData.tags.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {editedData.tags.map((tag, index) => (
                      <Badge key={index} variant="outline">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500">No tags assigned</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}