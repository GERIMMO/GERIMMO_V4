"use client";
import {useEffect} from 'react';
import {signalerPresence} from '@/app/actions/autonomie';
export function PresenceSupervision(){useEffect(()=>{void signalerPresence();},[]);return null;}
